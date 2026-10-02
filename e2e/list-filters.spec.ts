import { backendConfigured, expect, test } from './support/fixtures'
import { chooseSelect, field } from './support/ui-select'
import { isEnterpriseBackend } from './support/capabilities'

// List filters drive the query: the roles type filter adds is_global to GET /roles; the users
// "orphaned" toggle switches to GET /users/orphaned. (The permissions list's URL state, server
// pages and filters are covered by permissions/permissions-list-state.spec.) Reach and "orphaned" (no entity
// membership) are EnterpriseRBAC concepts; SimpleRBAC hides both (see simple-rbac-gating.spec).
// A role type and the users' orphaned filter survive a reload (route query).
test.describe('list filters', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('roles type filter scopes the query to system-wide roles', async ({ page }) => {
    test.skip(!(await isEnterpriseBackend()), 'EnterpriseRBAC only.')
    const globalRequests: string[] = []
    await page.route(/\/roles\/\?[^/]*$/, async (route) => {
      const url = route.request().url()
      if (route.request().method() === 'GET' && /is_global=true/.test(url)) globalRequests.push(url)
      await route.continue()
    })

    await page.goto('/app/roles')
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await chooseSelect(page, field(page, 'Filter by type'), 'System-wide')

    await expect.poll(() => globalRequests.length).toBeGreaterThan(0)
    await expect(page).toHaveURL(/[?&]type=global/)
    // Every listed role is system-wide: no organization or entity type badge.
    await expect(page.getByRole('table')).toContainText('System-wide')
    await expect(page.getByRole('table').getByText('Organization', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('table').getByText('Entity', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByLabel('Filter by type', { exact: true })).toContainText('System-wide')
  })

  test('users orphaned toggle switches to the orphaned endpoint', async ({ page }) => {
    test.skip(!(await isEnterpriseBackend()), 'EnterpriseRBAC only.')
    await page.goto('/app/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    const orphaned = page.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/users/orphaned'))
    await page.getByRole('checkbox', { name: 'Orphaned only' }).check()

    // Not just requested: answered, and its rows (or the empty state) are what the list shows.
    const response = await orphaned
    expect(response.ok()).toBe(true)
    const body = await response.json() as { items?: Array<{ email?: string, user?: { email?: string } }> } | Array<{ email?: string }>
    const rows = Array.isArray(body) ? body : (body.items ?? [])
    if (rows.length) await expect(page.locator('tbody tr').first()).toBeVisible()
    else await expect(page.getByRole('heading', { name: /^No / })).toBeVisible()
    await expect(page.getByText(/^Could not load /)).toHaveCount(0)
    await expect(page).toHaveURL(/[?&]orphaned=/)
  })
})
