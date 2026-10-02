import type { Page, Response } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { backendHasSurface, isEnterpriseBackend, liveAuthConfig, patchAuthConfig } from '../support/capabilities'
import { personaState } from '../support/personas'
import { jsonResponse } from '../support/mocks'

// The dashboard (WP-18, F-089). Admins get live counts, each the total of one `limit=1` request
// made with their own token (so a delegated admin's tiles are their organization's numbers) and
// linking to the list it summarises; the latest audit events where the backend records them.
// Accounts without admin pages get their own access and a launcher instead.

type Tile = {
  key: string
  label: string
  href: string
  // The request whose total the tile shows.
  matches: (url: URL) => boolean
}

const listCall = (path: string, extra: Record<string, string> = {}) => (url: URL) => url.pathname.endsWith(path)
  && url.searchParams.get('limit') === '1'
  && Object.entries(extra).every(([key, value]) => url.searchParams.get(key) === value)

const TILES: Record<string, Tile> = {
  'active-users': { key: 'active-users', label: 'Active users', href: '/app/users', matches: listCall('/users/', { status: 'active' }) },
  'invited-users': { key: 'invited-users', label: 'Pending invitations', href: '/app/users?status=invited', matches: listCall('/users/', { status: 'invited' }) },
  'suspended-users': { key: 'suspended-users', label: 'Suspended users', href: '/app/users?status=suspended', matches: listCall('/users/', { status: 'suspended' }) },
  'orphaned-users': { key: 'orphaned-users', label: 'Users without a membership', href: '/app/users?orphaned=true', matches: listCall('/users/orphaned') },
  'roles': { key: 'roles', label: 'Roles', href: '/app/roles', matches: listCall('/roles/') },
  'permissions': { key: 'permissions', label: 'Permissions', href: '/app/permissions', matches: listCall('/permissions/') },
  'organizations': { key: 'organizations', label: 'Organizations', href: '/app/entities', matches: listCall('/entities/', { root_only: 'true' }) },
  // outlabs-auth audits only wrong passwords on existing accounts as user.login_failed, so the
  // tile says so (v-auth-shell-05).
  'failed-sign-ins': { key: 'failed-sign-ins', label: 'Wrong passwords', href: '/app/audit?eventType=user.login_failed&range=24h', matches: listCall('/audit-events', { event_type: 'user.login_failed' }) }
}

// A tile's count, and the tiles in page order (UPageCard puts the test id on its link).
const tileValue = (page: Page, key: string) => page.getByTestId(`tile-value-${key}`)
const tileKeys = (page: Page) => page.locator('[data-testid^="dashboard-tile-"]')
  .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')!.replace('dashboard-tile-', '')))

// Opens the dashboard and returns, per counted tile, the total its request answered.
async function openDashboard(page: Page, tiles: Tile[]): Promise<Map<string, number>> {
  const answers = tiles.map(tile => page.waitForResponse((response: Response) => response.request().method() === 'GET' && response.ok() && tile.matches(new URL(response.url())))
    .then(async response => [tile.key, (await response.json() as { total: number }).total] as const))
  await page.goto('/app/dashboard')
  return new Map(await Promise.all(answers))
}

// `order` is every tile expected, in page order; those in TILES are checked against their request.
async function expectTiles(page: Page, order: string[]) {
  const tiles = order.filter(key => key in TILES).map(key => TILES[key]!)
  const totals = await openDashboard(page, tiles)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect.poll(() => tileKeys(page)).toEqual(order)
  for (const tile of tiles) {
    const total = totals.get(tile.key)!.toLocaleString('en-US')
    await expect(tileValue(page, tile.key), tile.label).toHaveText(total)
    // Each tile is one link, named with its count, which is the point of the tile (v-auth-shell-06).
    await expect(page.getByRole('region', { name: 'Overview' }).getByRole('link', { name: `${tile.label}: ${total}`, exact: true })).toHaveAttribute('href', tile.href)
  }
}

test.describe('dashboard: admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('counts match what the API answers and link to the filtered lists (F-089)', async ({ page }) => {
    const config = await liveAuthConfig()
    const enterprise = await isEnterpriseBackend()
    const keys = [
      'active-users',
      ...(config?.features.invitations ? ['invited-users'] : []),
      ...(config?.features.user_status ? ['suspended-users'] : []),
      ...(enterprise && await backendHasSurface('memberships') ? ['orphaned-users'] : []),
      'roles',
      'permissions',
      ...(enterprise ? ['organizations'] : []),
      ...(await backendHasSurface('audit') ? ['failed-sign-ins'] : [])
    ]
    await expectTiles(page, keys)
    // The capability checklist moved to Settings.
    await expect(page.getByTestId('capability-progress')).toHaveCount(0)
    await expect(page.getByText(/of \d+ enabled/)).toHaveCount(0)
    await expect(page.getByTestId('dashboard-my-access')).toHaveCount(0)
  })

  test('recent activity lists the latest audit events where the backend records them', async ({ page }) => {
    await page.goto('/app/dashboard')
    if (await backendHasSurface('audit')) {
      const card = page.getByRole('heading', { name: 'Recent activity' })
      await expect(card).toBeVisible()
      // globalSetup signed the personas in, so there is activity.
      await expect(page.getByRole('list', { name: 'Recent audit events' }).getByRole('listitem').first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open Audit' })).toHaveAttribute('href', '/app/audit')
    } else {
      await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0)
    }
  })

  test('a tile opens the list it counts, filtered', async ({ page, requires }) => {
    await requires({ features: ['invitations'], surfaces: ['users'] })
    await page.goto('/app/dashboard')
    // The whole card is one link (an overlay anchor named by the title and the count); open it
    // from the keyboard.
    await page.getByRole('region', { name: 'Overview' }).getByRole('link', { name: /^Pending invitations: \d/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/users\?status=invited$/)
    await expect(page.getByRole('combobox', { name: 'Filter by status' }).first()).toContainText('Invited')
  })

  test('a tile names its count, and says when the count is loading or could not load (v-auth-shell-06)', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 500 }, { kind: 'console', console: /status of 500/ })
    // Roles: held until checked; Permissions: refused by the server.
    let releaseRoles: () => void = () => {}
    const rolesHeld = new Promise<void>((resolve) => {
      releaseRoles = resolve
    })
    await page.route(url => url.pathname.endsWith('/roles/') && url.searchParams.get('limit') === '1', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await rolesHeld
      return route.fallback()
    })
    await page.route(url => url.pathname.endsWith('/permissions/') && url.searchParams.get('limit') === '1', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ ...jsonResponse(500, { error: 'INTERNAL_SERVER_ERROR', message: 'boom' }) })
    })
    await page.goto('/app/dashboard')
    // The link is the card's zero-size overlay anchor: attached and named, not "visible".
    const overview = page.getByRole('region', { name: 'Overview' })
    await expect(overview.getByRole('link', { name: 'Roles: loading', exact: true })).toBeAttached()
    await expect(overview.getByRole('link', { name: 'Permissions: could not load', exact: true })).toBeAttached()
    releaseRoles()
    await expect(overview.getByRole('link', { name: /^Roles: \d/ })).toBeAttached()
  })

  test('an unverifiable API contract is flagged on the admin dashboard too', async ({ page }) => {
    await patchAuthConfig(page, (config) => {
      const { api_contract_version: _omit, ...rest } = config
      return rest
    })
    await page.goto('/app/dashboard')
    await expect(page.getByText('API contract version not reported')).toBeVisible()
  })
})

test.describe('dashboard: delegated org admin (EnterpriseRBAC)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin') })

  test('counts are the organization\'s own, from the admin\'s own token', async ({ page }) => {
    test.skip(!(await isEnterpriseBackend()), 'The org-admin persona exists on the EnterpriseRBAC seed only.')
    // No permission:read (no Permissions tile), not a global admin (no orphaned count), and
    // anchored on ACME (its entities, not every organization).
    const entities = page.waitForResponse(response => response.ok() && /\/entities\/[0-9a-f-]+\/descendants$/.test(new URL(response.url()).pathname))
    await expectTiles(page, ['active-users', 'invited-users', 'suspended-users', 'roles', 'entities', 'failed-sign-ins'])
    const descendants = await (await entities).json() as { status: string }[]
    const inOrg = 1 + descendants.filter(entity => entity.status !== 'archived').length
    await expect(tileValue(page, 'entities')).toHaveText(String(inOrg))
  })
})

test.describe('dashboard: low-privilege account', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('agent') })

  test('shows their own access and a launcher instead of admin counts', async ({ page }) => {
    await page.goto('/app/dashboard')
    const access = page.getByTestId('dashboard-my-access')
    await expect(access).toBeVisible()
    await expect(access.getByText(/You hold \d+ permissions?\./)).toBeVisible()
    await expect(access.getByRole('link', { name: 'View your access' })).toHaveAttribute('href', '/app/account/access')
    await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0)
    // Preset and library internals are for admins.
    await expect(page.getByText(/Connected to /)).toHaveCount(0)
    const launcher = page.getByRole('region', { name: 'Go to' })
    await expect(launcher.getByRole('link')).toHaveCount(2)
    await expect(launcher.getByRole('link', { name: 'My API keys', exact: true })).toHaveAttribute('href', '/app/api-keys')
    await expect(launcher.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/app/account')
  })
})
