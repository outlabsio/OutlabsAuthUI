import { backendConfigured, expect, test } from '../support/fixtures'

// P2 roles vertical (authenticated matrix). Backend-gated like the rest.
test.describe('roles workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('lists seeded roles', async ({ page }) => {
    await page.goto('/app/roles')
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add role' })).toBeVisible()
    // Seeded by the enterprise_rbac reset (ACME Auditor).
    await expect(page.getByText('acme_auditor')).toBeVisible()
  })

  test('opens the create-role dialog', async ({ page }) => {
    await page.goto('/app/roles')
    await page.getByRole('button', { name: 'Add role' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('Display name')).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  })
})
