import { expect, test } from '../support/fixtures'
import { patchAuthConfig } from '../support/capabilities'

// F-055: the console speaks outlabs-auth.api/v1. A backend reporting another contract major
// must be refused with the configuration error screen instead of rendering with silently
// broken calls; an absent version (older library) still boots. Works with or without a live
// backend (the patch falls back to a minimal config).
test.describe('API contract check', () => {
  test('an unsupported api_contract_version shows the configuration error screen', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, api_contract_version: 'outlabs-auth.api/v2' }))
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Configuration error' })).toBeVisible()
    await expect(page.getByText('Server API contract: outlabs-auth.api/v2')).toBeVisible()
    await expect(page.getByText('Supported by this console: outlabs-auth.api/v1')).toBeVisible()
    // Nothing of the app renders behind it.
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0)
  })

  test('a supported minor version boots normally', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, api_contract_version: 'outlabs-auth.api/v1.3' }))
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Configuration error' })).toHaveCount(0)
  })

  // Format drift must never lock operators out: only a parsed, differing major blocks.
  for (const version of ['outlabs-auth.api/latest', 'v1']) {
    test(`an unparseable version (${version}) still boots`, async ({ page }) => {
      await patchAuthConfig(page, config => ({ ...config, api_contract_version: version }))
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Configuration error' })).toHaveCount(0)
    })
  }

  test('an absent version (older library) still boots', async ({ page }) => {
    await patchAuthConfig(page, (config) => {
      const { api_contract_version: _omit, ...rest } = config
      return rest
    })
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Configuration error' })).toHaveCount(0)
  })
})
