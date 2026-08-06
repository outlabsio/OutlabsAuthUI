import { backendConfigured, expect, test } from '../support/fixtures'

// P2 entities vertical (read-only). Backend-gated.
test.describe('entities workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('lists the entity hierarchy', async ({ page }) => {
    await page.goto('/app/entities')
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
  })
})
