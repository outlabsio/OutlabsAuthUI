import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { patchAuthConfig } from '../support/capabilities'
import { chooseSelect, field } from '../support/ui-select'
import { searchUsersList } from '../support/lists'
import { onPath } from '../support/session'

// The users list (WP-11): orphaned rows (F-010), filters in the URL (F-060, F-125), holds
// (F-061), row menus built from permissions and state (F-053, F-063), the invitations gate
// (F-171), empty states and page clamping (F-127, F-218), and the phone layout (F-133).

type User = { id: string, email: string }

// The row of one account. A search matches substrings (admin@… also finds org-admin@…), so rows
// are told apart by their exactly named actions button.
function rowOf(page: Page, email: string) {
  return page.locator('tbody tr').filter({ has: page.getByRole('button', { name: `User actions for ${email}`, exact: true }) })
}

async function openRowMenu(page: Page, email: string) {
  await page.getByRole('button', { name: `User actions for ${email}`, exact: true }).click()
  return page.getByRole('menu')
}

// Search the list and wait for the server's answer (without assuming a single match).
async function searchFor(page: Page, term: string) {
  const answered = page.waitForResponse(response => response.request().method() === 'GET'
    && /\/users\/?$/.test(new URL(response.url()).pathname)
    && new URL(response.url()).searchParams.get('search') === term)
  await page.getByPlaceholder('Search users...').fill(term)
  await answered
  await expect(rowOf(page, term)).toHaveCount(1)
}

test.describe('users list', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('orphaned rows show the account, where it last belonged and a working link (F-010)', async ({ page, api, requires, testData }) => {
    await requires({ preset: 'EnterpriseRBAC', surfaces: ['entities', 'memberships'] })
    // An orphan: an account that held a membership and lost it.
    const entity = await api.createEntity({ kind: 'orphan-org', display_name: testData.displayName('orphan-org') })
    const user = await api.createUser({ kind: 'orphan', first_name: 'Orphan', last_name: 'Row' })
    await api.post('/memberships/', { user_id: user.id, entity_id: entity.id })
    await api.delete(`/memberships/${entity.id}/${user.id}`)

    await page.goto('/app/users')
    await page.getByRole('checkbox', { name: 'Orphaned only' }).check()
    await expect(page).toHaveURL(/[?&]orphaned=true/)
    await expect(page.getByTestId('orphaned-note')).toContainText('includes deleted accounts')
    await expect(page.getByLabel('Filter by status', { exact: true })).toBeDisabled()
    const orphaned = page.waitForResponse(r => /\/users\/orphaned/.test(r.url()) && new URL(r.url()).searchParams.get('search') === user.email)
    await page.getByPlaceholder('Search users...').fill(user.email)
    await orphaned

    const row = rowOf(page, user.email)
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Orphan Row')
    await expect(row).toContainText('Active')
    await expect(row).toContainText(entity.display_name)
    await expect(row).toContainText('0 of 1 membership active')
    for (const header of ['Name', 'Status', 'Last entity', 'Last change', 'Memberships']) {
      await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
    }

    await row.getByRole('link', { name: user.email }).click()
    await expect(page).toHaveURL(onPath(`/app/users/${user.id}`))
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    // Back returns to the orphaned, searched view.
    await page.goBack()
    await expect(page).toHaveURL(/[?&]orphaned=true/)
    await expect(page.getByRole('checkbox', { name: 'Orphaned only' })).toBeChecked()
    await expect(rowOf(page, user.email)).toHaveCount(1)
  })

  test('filters live in the URL, go to the server and survive opening a user (F-060, F-125)', async ({ page, api }) => {
    const me = await api.me()
    const requests: URL[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'GET' && /\/users\/?$/.test(url.pathname)) requests.push(url)
    })

    await page.goto('/app/users')
    // (Other specs create accounts in parallel: the admin is not necessarily on page 1.)
    await expect(page.locator('tbody tr').first()).toBeVisible()
    const superusersOnly = page.waitForResponse(response => /\/users\/?$/.test(new URL(response.url()).pathname)
      && new URL(response.url()).searchParams.get('is_superuser') === 'true')
    await chooseSelect(page, field(page, 'Filter by account type'), 'Superusers')
    await expect(page).toHaveURL(/[?&]type=superuser/)
    await superusersOnly
    expect(requests.some(url => url.searchParams.get('is_superuser') === 'true')).toBe(true)
    // Every listed account is a superuser.
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) await expect(row.getByText('Superuser', { exact: true })).toBeVisible()

    await chooseSelect(page, field(page, 'Filter by status'), 'All statuses')
    await expect(page).toHaveURL(/[?&]status=all/)
    await searchFor(page, me.email)
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(me.email)

    // Open the account, come back: the view is the same.
    await rowOf(page, me.email).getByRole('link', { name: me.email }).click()
    await expect(page).toHaveURL(onPath(`/app/users/${me.id}`))
    await page.goBack()
    await expect(page).toHaveURL(/[?&]type=superuser/)
    await expect(page.getByLabel('Filter by status', { exact: true })).toContainText('All statuses')
    await expect(page.getByLabel('Filter by account type', { exact: true })).toContainText('Superusers')
    await expect(page.getByPlaceholder('Search users...')).toHaveValue(me.email)
    await expect(rowOf(page, me.email)).toHaveCount(1)
    // The total is always shown.
    await expect(page.getByRole('status').filter({ hasText: /^\d+ users?$/ })).toBeVisible()
  })

  test('a lockout and a timed suspension read as holds beside the status (F-061)', async ({ page, api }) => {
    const suspended = await api.createUser({ kind: 'hold-suspended' })
    const until = new Date(Date.now() + 5 * 24 * 3600e3).toISOString()
    await api.patch(`/users/${suspended.id}/status`, { status: 'suspended', suspended_until: until })
    const locked = await api.createUser({ kind: 'hold-locked' })
    // A lockout cannot be caused through the API without failing sign-ins (which spend the
    // shared login budget): the list answer carries one for this account.
    const lockedUntil = new Date(Date.now() + 3 * 3600e3).toISOString()
    await page.route(/\/users\/(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      const body = await response.json() as { items: Array<User & { locked_until?: string | null }> }
      for (const item of body.items) if (item.id === locked.id) item.locked_until = lockedUntil
      return route.fulfill({ response, json: body })
    })

    await page.goto('/app/users?status=all')
    await searchUsersList(page, locked.email)
    await expect(rowOf(page, locked.email)).toContainText('Active')
    await expect(rowOf(page, locked.email).getByText(/^Locked until /).filter({ visible: true })).toBeVisible()

    await searchUsersList(page, suspended.email)
    await expect(rowOf(page, suspended.email)).toContainText('Suspended')
    await expect(rowOf(page, suspended.email).getByText(/^Suspension end set for /).filter({ visible: true })).toBeVisible()
  })

  test('row menus follow the permissions and the account: no Delete on your own row (F-053, F-063)', async ({ page, api }) => {
    const me = await api.me()
    const other = await api.createUser({ kind: 'menu' })

    await page.goto('/app/users')
    await searchFor(page, me.email)
    let menu = await openRowMenu(page, me.email)
    await expect(menu.getByRole('menuitem', { name: 'View' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Your account' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Edit profile' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await searchUsersList(page, other.email)
    menu = await openRowMenu(page, other.email)
    await expect(menu.getByRole('menuitem')).toHaveText(['View', 'Edit profile', 'Delete'])
    await menu.getByRole('menuitem', { name: 'View' }).click()
    await expect(page).toHaveURL(onPath(`/app/users/${other.id}`))
  })

  test('a deleted account offers only View and Restore, and Restore brings it back (F-053)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'restore' })
    await api.delete(`/users/${user.id}`)

    await page.goto('/app/users?status=deleted')
    await searchUsersList(page, user.email)
    await expect(rowOf(page, user.email)).toContainText('Deleted')
    const menu = await openRowMenu(page, user.email)
    await expect(menu.getByRole('menuitem')).toHaveText(['View', 'Restore'])
    await menu.getByRole('menuitem', { name: 'Restore' }).click()
    const confirm = page.getByRole('dialog', { name: `Restore user ${user.email}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('roles, memberships and API keys stay revoked')
    await confirm.getByRole('button', { name: 'Restore user' }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText('User restored', { exact: true })).toBeVisible()
    // Restored accounts are active: gone from the Deleted view.
    await expect(rowOf(page, user.email)).toHaveCount(0)
    expect((await api.get<{ status: string }>(`/users/${user.id}`)).status).toBe('active')
  })

  // Rows are keyed by account, not by position. When the list changes under an open row dialog
  // (here a narrower search that answers late), each account keeps its row, so closing the
  // dialog returns focus to that account's actions button, not to a row that now lists someone
  // else, or to the page.
  test('closing a row dialog after the list changed returns focus to that account', async ({ page, api }) => {
    const target = await api.createUser({ kind: 'rowkey-x' })
    // Created later, so it lists above the target in every search that finds both.
    await api.createUser({ kind: 'rowkey-a' })
    const prefix = target.email.slice(0, target.email.indexOf('rowkey-') + 'rowkey-'.length)
    const searched = (term: string) => page.waitForResponse(response => response.request().method() === 'GET'
      && /\/users\/?$/.test(new URL(response.url()).pathname)
      && new URL(response.url()).searchParams.get('search') === term)
    await page.goto('/app/users')
    const both = searched(prefix)
    await page.getByPlaceholder('Search users...').fill(prefix)
    await both
    await expect(rowOf(page, target.email)).toHaveCount(1)
    await expect(page.locator('tbody tr').first()).not.toContainText(target.email)

    // The narrower search answers only once the target's Delete dialog is open.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(url => /\/users\/?$/.test(url.pathname) && url.searchParams.get('search') === target.email, async (route) => {
      await held
      await route.continue().catch(() => {})
    })
    await page.getByPlaceholder('Search users...').fill(target.email)
    const actions = page.getByRole('button', { name: `User actions for ${target.email}`, exact: true })
    await actions.click()
    await page.getByRole('menuitem', { name: /^Delete/ }).click()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).first()
    await expect(dialog).toBeVisible()
    const narrowed = searched(target.email)
    release()
    await narrowed
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(actions).toBeFocused()
  })

  test('no Invite on a backend with invitations turned off (F-171)', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, features: { ...config.features, invitations: false } }))
    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite', exact: true })).toHaveCount(0)
  })

  test('an empty search says nothing matches and clears; an out-of-range page is clamped (F-127, F-218)', async ({ page }) => {
    await page.goto('/app/users?q=no-such-user-anywhere-wp11')
    const empty = page.getByText('No users match')
    await expect(empty).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(empty).toBeHidden()
    await expect(page.getByPlaceholder('Search users...')).toHaveValue('')
    await expect(page.locator('tbody tr').first()).toBeVisible()

    // A stale link (or the last row of the last page deleted) lands on the last real page.
    await page.goto('/app/users?status=all&page=999')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page).not.toHaveURL(/[?&]page=999/)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('filters sit behind a Filters button and every row keeps its actions on screen (F-127, F-133)', async ({ page, api }) => {
      const me = await api.me()
      await page.goto('/app/users')
      await expect(page.getByLabel('Filter by status', { exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Filters' }).click()
      // Stacked in the Filters panel, the select is labelled by its field.
      await chooseSelect(page, field(page, 'Status'), 'All statuses')
      await expect(page).toHaveURL(/[?&]status=all/)
      await page.keyboard.press('Escape')

      const row = rowOf(page, me.email)
      await searchFor(page, me.email)
      const actions = row.getByRole('button', { name: `User actions for ${me.email}` })
      await expect(actions).toBeInViewport()
      // The status reads under the name; the page never scrolls sideways.
      await expect(row.getByText('Active', { exact: true }).first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    })
  })
})
