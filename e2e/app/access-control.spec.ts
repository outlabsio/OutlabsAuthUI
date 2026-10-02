import { backendConfigured, expect, test } from '../support/fixtures'
import { backendHasSurface, isEnterpriseBackend, unmetRequirement } from '../support/capabilities'
import { sidebarNav, userMenuLinks } from '../support/shell'

// Multi-persona access control. This spec runs in the chromium project but re-points at the
// low-privilege agent persona's storage state, minted through the API by globalSetup
// (personaState('agent') in support/personas.ts; EnterpriseRBAC agent: lead:* only;
// SimpleRBAC writer: post:/comment: only — neither is a superuser). Every RBAC-gated admin
// surface must degrade to an in-place "No access to …" state naming the missing permission
// (never a redirect) and vanish from the sidebar — while personal surfaces (dashboard,
// account, API keys) stay reachable. A section whose router the backend doesn't mount is not a
// permission question: its route redirects to the dashboard.
test.use({ storageState: 'e2e/.auth/agent.json' })

const DENIED: { path: string, title: string, permission: string, surface?: string, feature?: string }[] = [
  { path: '/app/users', title: 'No access to users', permission: 'user:read' },
  { path: '/app/roles', title: 'No access to roles', permission: 'role:read' },
  { path: '/app/permissions', title: 'No access to permissions', permission: 'permission:read' },
  { path: '/app/entities', title: 'No access to entities', permission: 'entity:read', surface: 'entities' },
  { path: '/app/service-accounts', title: 'No access to service accounts', permission: 'api_key:read', surface: 'integration_principals', feature: 'system_api_keys' },
  { path: '/app/audit', title: 'No access to audit', permission: 'user:read', surface: 'audit' }
]
const HIDDEN_NAV = ['Users', 'Roles', 'Permissions', 'Entities', 'Audit', 'Service accounts', 'Settings']

test.describe('access control (agent persona)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('reaches the personal surfaces it is entitled to', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^No access to / })).toHaveCount(0)

    await page.goto('/app/account')
    await expect(page).toHaveURL(/\/app\/account/)
    await expect(page.getByRole('heading', { name: /^No access to / })).toHaveCount(0)

    // API keys are personal (own keys), capability-gated not RBAC-gated, so the agent keeps them.
    await page.goto('/app/api-keys')
    await expect(page).toHaveURL(/\/app\/api-keys/)
    await expect(page.getByRole('button', { name: 'Create API key' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^No access to / })).toHaveCount(0)
  })

  test('sidebar hides the admin resources the agent cannot read', async ({ page }) => {
    await page.goto('/app/dashboard')
    // The surfaces it keeps: the dashboard in the sidebar, its own pages in the user menu.
    await expect(sidebarNav(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
    expect((await userMenuLinks(page)).map(link => link.name)).toEqual(['My API keys', 'Account'])
    // The admin resources it does not — including Audit, which needs user:read even though
    // the backend reports activity_tracking as always on. No empty group headings either.
    for (const name of HIDDEN_NAV) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)
    }
    for (const heading of ['Directory', 'Access control', 'Integrations', 'Monitoring']) {
      await expect(sidebarNav(page).getByText(heading, { exact: true })).toHaveCount(0)
    }
  })

  // Settings is for admins (F-186): any read of an admin section this backend has opens it, and
  // the denial names exactly those (no entity:read where there are no entities, v-auth-shell-08).
  test('shows an in-place denial at /app/settings naming the admin permissions', async ({ page }) => {
    const entities = await isEnterpriseBackend()
    const needed = ['user:read', 'role:read', 'permission:read', ...(entities ? ['entity:read'] : []), 'api_key:read']
    await page.goto('/app/settings')
    await expect(page).toHaveURL(/\/app\/settings$/)
    await expect(page.getByRole('heading', { name: 'No access to settings' })).toBeVisible()
    await expect(page.getByText(`You need one of these permissions: ${needed.join(', ')}.`)).toBeVisible()
    if (!entities) await expect(page.getByText(/entity:read/)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Auth server' })).toHaveCount(0)
  })

  for (const { path, title, permission, surface, feature } of DENIED) {
    test(`shows an in-place denial at ${path} (no redirect)`, async ({ page }) => {
      const unavailable = (surface && !(await backendHasSurface(surface)))
        || (feature && (await unmetRequirement({ features: [feature] })) !== null)
      if (unavailable) {
        // Not mounted on this backend: the route guard sends the deep link to the dashboard.
        await page.goto(path)
        await expect(page).toHaveURL(/\/app\/dashboard$/)
        return
      }
      await page.goto(path)
      // The URL is unchanged — the app renders the denial in place rather than bouncing.
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`))
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      // The denial names the missing permission and offers a way out.
      await expect(page.getByText(`You need the ${permission} permission`)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Go to dashboard' })).toBeVisible()
      // No live chrome above the lock: no search toolbar, no create actions, no section guide
      // (v-keys-audit-06: Service accounts and Audit offered theirs).
      await expect(page.getByRole('textbox', { name: /search/i })).toHaveCount(0)
      await expect(page.getByPlaceholder(/^Search /)).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^(Add|New|Create|Invite)/ })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /guide$|^About /i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(0)
    })
  }

  // v-access-07: the entities denial spans the page like every other section's, not the tree's
  // resizable third.
  test('the entities denial is a full-width panel without a resize handle', async ({ page }) => {
    test.skip(!(await backendHasSurface('entities')), 'The backend does not mount the entities router.')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/app/entities')
    const heading = page.getByRole('heading', { name: 'No access to entities' })
    await expect(heading).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByRole('separator')).toHaveCount(0)
    const [mainBox, headingBox] = [await main.boundingBox(), await heading.boundingBox()]
    // Centred in the main area (the tree's third would put it in the left half).
    const offset = Math.abs((headingBox!.x + headingBox!.width / 2) - (mainBox!.x + mainBox!.width / 2))
    expect(offset).toBeLessThan(mainBox!.width * 0.1)
  })
})
