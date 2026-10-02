import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { apiRoot, isEnterpriseBackend } from '../support/capabilities'
import { adminAccessToken } from '../support/admin-token'

// F-008 / F-007: SimpleRBAC is flat — no entities, memberships, root orgs or scoped roles, and it
// mounts no audit router. The console must not render those concepts there, and must not
// query /entities, /memberships or /audit-events. Runs only against a SimpleRBAC backend
// (admin storageState = the SimpleRBAC superuser).

function trackForbiddenRequests(page: Page) {
  const hits: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(apiRoot)) return
    const path = url.slice(apiRoot.length)
    if (/^\/(entities|memberships|audit-events|config\/)/.test(path) || /\/admin\/entities\//.test(path)) hits.push(`${request.method()} ${path}`)
  })
  return hits
}

async function firstNonAdminUserId(): Promise<string> {
  const res = await fetch(`${apiRoot}/users/?page=1&limit=50&status=active`, {
    headers: { authorization: `Bearer ${adminAccessToken()}` }
  })
  const body = await res.json() as { items: { id: string, is_superuser?: boolean }[] }
  const user = body.items.find(u => !u.is_superuser) ?? body.items[0]
  if (!user) throw new Error('seed: no users')
  return user.id
}

test.describe('SimpleRBAC hides entity and tree concepts', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async () => {
    test.skip(await isEnterpriseBackend(), 'SimpleRBAC only (EnterpriseRBAC shows these controls).')
  })

  test('no Audit or Entities in the nav, and their routes redirect', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Audit', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Entities', exact: true })).toHaveCount(0)

    await page.goto('/app/audit')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await page.goto('/app/entities')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })

  test('users list: no Orphaned filter, organization or invite entity', async ({ page }) => {
    const hits = trackForbiddenRequests(page)
    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Orphaned only' })).toHaveCount(0)
    await expect(page.getByLabel('Filter by organization', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Organization' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Add user' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Add user' })
    await expect(createDialog.getByLabel('Email')).toBeVisible()
    await expect(createDialog.getByText('Root org')).toHaveCount(0)
    await expect(createDialog.getByText('Organization', { exact: true })).toHaveCount(0)
    await createDialog.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const inviteDialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(inviteDialog.getByLabel('Email')).toBeVisible()
    await expect(inviteDialog.getByLabel('Entity', { exact: true })).toHaveCount(0)
    await inviteDialog.getByRole('button', { name: 'Cancel' }).click()

    expect(hits).toEqual([])
  })

  test('roles: no type, scope, reach or entity-type controls', async ({ page }) => {
    const hits = trackForbiddenRequests(page)
    await page.goto('/app/roles')
    await expect(page.getByRole('button', { name: 'Add role' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Type' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Scope' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Reach' })).toHaveCount(0)
    await expect(page.getByLabel('Filter by type', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Add role' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add role' })
    await expect(dialog.getByText('Display name')).toBeVisible()
    await expect(dialog.getByLabel('Type', { exact: true })).toHaveCount(0)
    await expect(dialog.getByText('Scope', { exact: true })).toHaveCount(0)
    await expect(dialog.getByText('Assignable at', { exact: true })).toHaveCount(0)
    await expect(dialog.getByText('Applies to', { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Role detail: no reach/scope/auto-assign/root entity/assignable-at rows.
    await page.locator('tbody > tr').first().getByRole('link').first().click()
    await expect(page).toHaveURL(/\/app\/roles\/[^/]+$/)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    for (const label of ['Type', 'Defined at', 'Applies to', 'Reach', 'Scope', 'Auto-assigned', 'Root entity', 'Assignable at']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    }
    expect(hits).toEqual([])
  })

  test('user detail: no memberships, membership history or root entity; the audit timeline stays', async ({ page }) => {
    const userId = await firstNonAdminUserId()
    const hits = trackForbiddenRequests(page)
    await page.goto(`/app/users/${userId}`)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByText('Organization', { exact: true })).toHaveCount(0)
    await page.goto(`/app/users/${userId}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Memberships', exact: true })).toHaveCount(0)
    // The per-user audit timeline is served by the users router and works on SimpleRBAC ...
    await page.goto(`/app/users/${userId}?tab=history`)
    await expect(page.getByRole('heading', { name: 'Audit timeline' })).toBeVisible()
    // ... but there is no audit router to deep-link into.
    await expect(page.getByRole('button', { name: 'Open in Audit' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Membership history' })).toHaveCount(0)
    await expect(page.getByText(/unavailable/i)).toHaveCount(0)
    expect(hits).toEqual([])
  })

  test('service accounts: platform scope only, no entity picker or key inventory', async ({ page }) => {
    const hits = trackForbiddenRequests(page)
    await page.goto('/app/service-accounts?scope=entity&view=inventory')
    // The navbar action (an empty list offers the same one).
    await expect(page.getByRole('button', { name: 'New service account' }).first()).toBeVisible()
    await expect(page.getByLabel('Scope', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Entity', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Key inventory' })).toHaveCount(0)
    await page.getByRole('button', { name: 'New service account' }).first().click()
    await expect(page.getByRole('dialog', { name: 'New service account' }).getByRole('switch', { name: 'Includes child entities' })).toHaveCount(0)
    expect(hits).toEqual([])
  })

  test('settings shows the contract, library and mounted surfaces but no entity types', async ({ page }) => {
    const hits = trackForbiddenRequests(page)
    await page.goto('/app/settings')
    await expect(page.getByText('Mounted routers')).toBeVisible()
    await expect(page.getByText('outlabs-auth.api/v1')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Entity types' })).toHaveCount(0)
    expect(hits).toEqual([])
  })
})
