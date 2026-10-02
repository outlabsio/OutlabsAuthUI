import { backendConfigured, expect, test } from '../support/fixtures'
import { isEnterpriseBackend } from '../support/capabilities'
import { sidebarNav, userMenuLinks } from '../support/shell'

// Authenticated matrix (chromium project, admin persona). The shell's own behaviour (titles,
// landmarks, back navigation, scroll memory, palette, mobile drawer) is in shell-navigation.spec.ts.
test.describe('app shell', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the dashboard shell with navigation', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    // Admins land on live counts (dashboard.spec.ts covers them); capabilities live in Settings.
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    await expect(sidebarNav(page).getByRole('link', { name: 'Users' })).toBeVisible()
    await expect(sidebarNav(page).getByRole('link', { name: 'Roles' })).toBeVisible()
  })

  test('navigates to the users workspace', async ({ page }) => {
    await page.goto('/app/dashboard')
    await sidebarNav(page).getByRole('link', { name: 'Users', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/users/)
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
  })

  test('groups the admin sidebar and offers personal pages from the user menu', async ({ page }) => {
    await page.goto('/app/dashboard')
    const enterprise = await isEnterpriseBackend()
    // Directory, Access control, Integrations, Monitoring; Settings pinned at the bottom.
    // SimpleRBAC mounts neither the entities nor the audit router.
    const expected = enterprise
      ? ['Dashboard', 'Users', 'Entities', 'Roles', 'Permissions', 'Service accounts', 'Audit', 'Settings']
      : ['Dashboard', 'Users', 'Roles', 'Permissions', 'Service accounts', 'Settings']
    await expect(sidebarNav(page).getByRole('link')).toHaveText(expected)
    for (const heading of ['Directory', 'Access control', 'Integrations', ...(enterprise ? ['Monitoring'] : [])]) {
      await expect(sidebarNav(page).getByText(heading, { exact: true })).toBeVisible()
    }
    // The actor's own pages moved out of the admin list, away from the service-account keys.
    await expect(sidebarNav(page).getByRole('link', { name: 'My API keys', exact: true })).toHaveCount(0)
    await expect(sidebarNav(page).getByRole('link', { name: 'Account', exact: true })).toHaveCount(0)
    // Account first, as the design orders the user menu (v-auth-shell-07).
    expect(await userMenuLinks(page)).toEqual([
      { name: 'Account', href: '/app/account' },
      { name: 'My API keys', href: '/app/api-keys' }
    ])
  })

  test('already-authenticated visits to login redirect into the app', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page).toHaveURL(/\/app\/dashboard/)
  })
})
