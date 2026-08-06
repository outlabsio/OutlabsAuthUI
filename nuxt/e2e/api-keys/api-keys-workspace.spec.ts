import { backendConfigured, expect, test } from '../support/fixtures'

// P2 api-keys vertical (read-only). Backend-gated.
test.describe('api keys workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the API keys workspace', async ({ page }) => {
    await page.goto('/app/api-keys')
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
  })
})
