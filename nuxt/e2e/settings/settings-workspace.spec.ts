import { backendConfigured, expect, test } from '../support/fixtures'

// P2 settings vertical (authenticated matrix).
test.describe('settings workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders runtime capabilities and entity types', async ({ page }) => {
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Runtime capabilities' })).toBeVisible()
    // EnterpriseRBAC preset badge + the entity-hierarchy-gated section.
    await expect(page.getByText('EnterpriseRBAC')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Entity types' })).toBeVisible()
  })
})
