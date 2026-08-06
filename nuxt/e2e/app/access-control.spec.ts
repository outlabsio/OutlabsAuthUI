import { backendConfigured, expect, test } from '../support/fixtures'

// Multi-persona access control. This spec runs in the chromium project but re-points at the
// low-privilege agent storageState produced by auth.setup.ts. The EnterpriseRBAC "agent"
// holds only lead:* permissions and is NOT a superuser, so every RBAC-gated admin surface
// must degrade to an in-place "Insufficient permissions" state (never a redirect) and vanish
// from the sidebar — while personal surfaces (dashboard, account, API keys) stay reachable.
test.use({ storageState: 'e2e/.auth/agent.json' })

const DENIED_RESOURCES = ['/app/users', '/app/roles', '/app/permissions', '/app/entities']
const HIDDEN_NAV = ['Users', 'Roles', 'Permissions', 'Entities']

test.describe('access control (agent persona)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('reaches the personal surfaces it is entitled to', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Insufficient permissions')).toHaveCount(0)

    await page.goto('/app/account')
    await expect(page).toHaveURL(/\/app\/account/)
    await expect(page.getByText('Insufficient permissions')).toHaveCount(0)

    // API keys are personal (own keys), capability-gated not RBAC-gated, so the agent keeps them.
    await page.goto('/app/api-keys')
    await expect(page).toHaveURL(/\/app\/api-keys/)
    await expect(page.getByText('Insufficient permissions')).toHaveCount(0)
  })

  test('sidebar hides the admin resources the agent cannot read', async ({ page }) => {
    await page.goto('/app/dashboard')
    // The surfaces it keeps.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'API Keys', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible()
    // The admin resources it does not.
    for (const name of HIDDEN_NAV) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)
    }
  })

  for (const path of DENIED_RESOURCES) {
    test(`shows an in-place denial at ${path} (no redirect)`, async ({ page }) => {
      await page.goto(path)
      // The URL is unchanged — the app renders the denial in place rather than bouncing.
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`))
      await expect(page.getByText('Insufficient permissions')).toBeVisible()
    })
  }
})
