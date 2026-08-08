import { backendConfigured, expect, test } from './support/fixtures'
import { chooseSelect } from './support/ui-select'

// List filters drive the query: the roles reach filter adds is_global to GET /roles; the users
// "orphaned" toggle switches to GET /users/orphaned. (The permissions resource/system filters are
// client-side over the whole list; not asserted here.)
test.describe('list filters', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('roles reach filter scopes the query to global roles', async ({ page }) => {
    const globalRequests: string[] = []
    await page.route(/\/roles\/\?[^/]*$/, async (route) => {
      const url = route.request().url()
      if (route.request().method() === 'GET' && /is_global=true/.test(url)) globalRequests.push(url)
      await route.continue()
    })

    await page.goto('/app/roles')
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await chooseSelect(page, 'role-reach-filter', 'Global')

    await expect.poll(() => globalRequests.length).toBeGreaterThan(0)
    // Every listed role is global (badge reads "Global", never "Scoped").
    await expect(page.getByRole('cell', { name: 'Scoped', exact: true })).toHaveCount(0)
  })

  test('users orphaned toggle switches to the orphaned endpoint', async ({ page }) => {
    let orphanedHit = false
    await page.route(/\/users\/orphaned/, async (route) => {
      if (route.request().method() === 'GET') orphanedHit = true
      await route.continue()
    })

    await page.goto('/app/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Orphaned only' }).check()

    await expect.poll(() => orphanedHit).toBe(true)
  })
})
