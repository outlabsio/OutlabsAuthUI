import type { Page } from '@playwright/test'
import { expect, expectSeeded, persona, personaState, test } from '../support/fixtures'
import { cardByHeading } from '../support/entities'
import { apiUrl } from '../support/env'
import { jsonResponse } from '../support/mocks'
import { onPath } from '../support/session'
import { userActionsButton, userDetailPath, userTabs } from '../support/users'

// The user detail's frame (WP-12): not-found states for bad links (F-122), no actions until the
// account has loaded (F-209), a failed refresh that keeps the loaded page (F-122), and the
// Access and Security tables at phone width.

const ROLE_IDS = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3']

// The API's own record of a user, not the console's /app/users/<id> page.
const isUserRecord = (userId: string) => (url: URL) => url.pathname.endsWith(`/users/${userId}`) && !url.pathname.startsWith('/app/')

async function tableFits(page: Page, heading: string, actionName: RegExp) {
  const card = cardByHeading(page, heading)
  const table = card.getByRole('table')
  await expect(table.locator('tbody tr').first()).toBeVisible()
  const scroller = table.locator('xpath=..')
  const fits = await scroller.evaluate(el => el.scrollWidth <= el.clientWidth)
  expect(fits, `${heading} table scrolls sideways at 390px`).toBe(true)
  const width = page.viewportSize()!.width
  for (const action of await card.getByRole('button', { name: actionName }).all()) {
    await expect(action).toBeVisible()
    const box = (await action.boundingBox())!
    expect(box.x + box.width, `${heading} row action on screen`).toBeLessThanOrEqual(width)
  }
}

test.describe('user detail frame', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, surfaces: ['users'] })
  })

  test('a malformed id renders "not found" without asking the API, with a way back', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().startsWith(apiUrl('/users/not-a-uuid'))) asked.push(request.url())
    })
    await page.goto('/app/users/not-a-uuid')
    await expect(page.getByText('User not found', { exact: true })).toBeVisible()
    await expect(userTabs(page)).toHaveCount(0)
    await expect(userActionsButton(page)).toHaveCount(0)
    expect(asked).toEqual([])
    await page.getByRole('main').getByRole('link', { name: 'Back to users', exact: true }).click()
    await expect(page).toHaveURL(onPath('/app/users'))
  })

  test('an unknown account renders "not found", and nothing is offered while it loads', async ({ page, errorGuard }) => {
    const missing = '00000000-0000-4000-8000-00000000dead'
    errorGuard.allow({ status: 404, url: apiUrl(`/users/${missing}`) }, { kind: 'console', console: /status of 404/ })
    // Hold the answer so the loading state can be checked first (F-209).
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(isUserRecord(missing), async (route) => {
      await held
      await route.continue()
    })
    await page.goto(`/app/users/${missing}`)
    await expect(page.getByRole('status').filter({ hasText: 'Loading user' })).toBeVisible()
    await expect(userActionsButton(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    release()
    await expect(page.getByText('User not found', { exact: true })).toBeVisible()
    await expect(page.getByText(/doesn't exist/)).toBeVisible()
    await expect(userActionsButton(page)).toHaveCount(0)
  })

  test('a refresh that fails after a save keeps the page, says so, and recovers on Retry', async ({ page, api, errorGuard }) => {
    const user = await api.createUser({ kind: 'detail-stale', first_name: 'Stale', last_name: 'Before' })
    errorGuard.allow({ status: 503, url: apiUrl(`/users/${user.id}`) }, { kind: 'console', console: /status of 503/ })
    let failReads = false
    await page.route(isUserRecord(user.id), async (route) => {
      if (failReads && route.request().method() === 'GET') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Service unavailable' }) })
      }
      return route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    // The save succeeds; the refetch it triggers does not (a gateway blip).
    failReads = true
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    await dialog.getByLabel('Last name').fill('After')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('User updated', { exact: true })).toBeVisible()

    const stale = page.getByRole('alert').filter({ hasText: 'Couldn\'t refresh' })
    await expect(stale).toBeVisible({ timeout: 15_000 })
    // The loaded record stays on screen, with its tabs.
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(userTabs(page)).toBeVisible()

    failReads = false
    await stale.getByRole('button', { name: 'Retry' }).click()
    await expect(stale).toBeHidden()
    await expect(page.getByText('After', { exact: true })).toBeVisible()
  })

  test.describe('at 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    // Layout only: the widest rows the API can return, not whatever the account has.
    test('the Memberships table fits its card with the row menu on screen', async ({ page, api, requires }) => {
      await requires({ preset: 'EnterpriseRBAC', surfaces: ['memberships'] })
      const user = await api.createUser({ kind: 'detail-mobile' })
      const entity = (await api.get<{ items: Array<{ id: string }> }>('/entities/', { query: { limit: 1 } })).items[0]!
      const now = new Date().toISOString()
      const memberships = [{
        id: 'm1',
        entity_id: entity.id,
        user_id: user.id,
        role_ids: ROLE_IDS,
        status: 'active',
        effective_status: 'active',
        joined_at: now,
        is_currently_valid: true,
        can_grant_permissions: true
      }]
      // Every page of every status (the card reads them all): one short page here.
      await page.route(url => url.href.startsWith(apiUrl(`/memberships/user/${user.id}`)), route => route.fulfill(jsonResponse(200, memberships)))

      await page.goto(userDetailPath(user.id, 'access'))
      await tableFits(page, 'Memberships', /^Membership actions for /)
    })

    // Every preset with personal API keys (SimpleRBAC too).
    test('the Personal API keys table fits its card with the row menu on screen', async ({ page, api, requires }) => {
      await requires({ features: ['api_keys'] })
      const user = await api.createUser({ kind: 'detail-mobile-keys' })
      const now = new Date().toISOString()
      const keys = [{
        id: 'k1',
        prefix: 'sk_live_a1b2c3d4',
        name: 'A rather long integration key name used for nightly reporting',
        key_kind: 'personal',
        scopes: ['user:read'],
        rate_limit_per_minute: 60,
        status: 'active',
        usage_count: 3,
        created_at: now,
        last_used_at: now
      }]
      await page.route(apiUrl(`/users/${user.id}/api-keys`), route => route.fulfill(jsonResponse(200, keys)))

      await page.goto(userDetailPath(user.id, 'security'))
      await tableFits(page, 'Personal API keys', /^Personal API key actions for /)
      // The prefix moved under the name rather than off screen.
      await expect(cardByHeading(page, 'Personal API keys').getByText('sk_live_a1b2c3d4').filter({ visible: true })).toBeVisible()
    })
  })
})

// A delegated organization admin (release-gating persona): reads accounts in their organization
// without user:update, so the detail offers nothing to change, links only what they can open, and
// its history never asks for records the API would refuse.
test.describe('user detail (delegated org admin)', () => {
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'], surfaces: ['users', 'roles'] })
  })

  test('a superuser in their organization: no actions, the system-wide role is not a link, history without failed lookups', async ({ page, api, apiAs }) => {
    const superuser = await api.findUserByEmail(persona('admin').email)
    expectSeeded(superuser, 'the admin persona\'s account exists')
    const visible = await apiAs('orgAdmin').get(`/users/${superuser!.id}`, { allow: [404] })
    expectSeeded(visible, 'the admin persona belongs to the org admin\'s organization')

    await page.goto(userDetailPath(superuser!.id))
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(userActionsButton(page)).toHaveCount(0)

    // The direct grant is a system-wide role the org admin cannot open: plain text (F-122).
    const roles = await api.get<Array<{ role: { display_name: string, is_global?: boolean } }>>(`/users/${superuser!.id}/role-memberships`)
    const systemWide = roles.find(grant => grant.role.is_global)
    await page.goto(userDetailPath(superuser!.id, 'access'))
    if (systemWide) {
      const card = cardByHeading(page, 'Direct roles')
      await expect(card.getByText(systemWide.role.display_name, { exact: true })).toBeVisible()
      await expect(card.getByRole('link', { name: systemWide.role.display_name })).toHaveCount(0)
    }

    await page.goto(userDetailPath(superuser!.id, 'security'))
    const sessions = cardByHeading(page, 'Active sessions')
    await expect(sessions.locator('[data-query-state]').first()).toHaveAttribute('data-query-state', /success|empty/)
    await expect(sessions.getByRole('button', { name: /^Revoke session/ })).toHaveCount(0)
    await expect(sessions.getByRole('button', { name: 'Sign out everywhere' })).toHaveCount(0)

    // The strict guard fails the test on any 4xx: actors outside reach are never looked up.
    await page.goto(userDetailPath(superuser!.id, 'history'))
    await expect(page.getByRole('heading', { name: 'Membership history' })).toBeVisible()
    await page.waitForLoadState('networkidle')
  })
})
