import { backendConfigured, expect, test } from '../support/fixtures'
import { backendHasSurface, liveAuthConfig, patchAuthConfig } from '../support/capabilities'

// Settings (WP-18, F-186/F-187): admins only (access-control.spec covers the denial). The auth
// server card labels every capability once; entity types show where the config router is
// mounted and the entity hierarchy is on.
test.describe('settings workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the auth server card and, where they exist, the entity types', async ({ page }) => {
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Auth server' })).toBeVisible()
    const config = await liveAuthConfig()
    await expect(page.getByText(config?.preset ?? 'EnterpriseRBAC', { exact: true })).toBeVisible()
    const entityTypes = Boolean(config?.features.entity_hierarchy) && await backendHasSurface('config')
    await expect(page.getByRole('heading', { name: 'Entity types' })).toHaveCount(entityTypes ? 1 : 0)
  })

  test('labels the contract, library version, routers, sign-in methods and features once', async ({ page }) => {
    const config = await liveAuthConfig()
    await page.goto('/app/settings')
    const card = page.getByRole('heading', { name: 'Auth server' }).locator('xpath=ancestor::*[@data-slot="root"][1]')
    await expect(card.getByText('Mounted routers')).toBeVisible()
    // Each mounted router is a labelled badge carrying its raw name as a title.
    for (const surface of config?.mounted_surfaces ?? []) {
      await expect(card.locator(`[title="${surface}"]`)).toBeVisible()
    }
    if (config?.mounted_surfaces?.includes('integration_principals')) await expect(card.locator('[title="integration_principals"]')).toHaveText('Service accounts')
    if (config?.api_contract_version) await expect(card.getByText(config.api_contract_version)).toBeVisible()
    if (config?.library_version) await expect(card.getByText(config.library_version, { exact: true })).toBeVisible()
    if (config?.auth_methods?.password) await expect(card.getByText(/^Password/)).toBeVisible()
    // Features by their labels, never as raw keys ('Abac', 'Api keys').
    const features = card.getByRole('list', { name: 'Features' })
    await expect(features.getByText('Activity tracking', { exact: true })).toBeVisible()
    await expect(features.getByText('Personal API keys', { exact: true })).toBeVisible()
    await expect(card.getByText(/^Abac$|^Api keys$/)).toHaveCount(0)
    // The retired available_permissions count is gone.
    await expect(page.getByText(/permissions available/)).toHaveCount(0)
  })

  // An unverifiable contract (unparseable or absent version) warns here instead of blocking.
  test('warns when the API contract version is unrecognized', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, api_contract_version: 'outlabs-auth.api/latest' }))
    await page.goto('/app/settings')
    await expect(page.getByText('API contract version not recognized')).toBeVisible()
    await expect(page.getByText('outlabs-auth.api/latest', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Configuration error' })).toHaveCount(0)
  })

  test('warns when the API contract version is not reported', async ({ page }) => {
    await patchAuthConfig(page, (config) => {
      const { api_contract_version: _omit, ...rest } = config
      return rest
    })
    await page.goto('/app/settings')
    await expect(page.getByText('API contract version not reported')).toBeVisible()
    await expect(page.getByText('Not reported', { exact: true })).toBeVisible()
  })
})
