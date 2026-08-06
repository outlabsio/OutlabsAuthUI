import { backendConfigured, expect, test } from '../support/fixtures'

// P2 permissions vertical (authenticated matrix).
test.describe('permissions workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the permissions workspace', async ({ page }) => {
    await page.goto('/app/permissions')
    await expect(page.getByRole('heading', { name: 'Permissions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add permission' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('opens the create-permission dialog', async ({ page }) => {
    await page.goto('/app/permissions')
    await page.getByRole('button', { name: 'Add permission' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  })
})
