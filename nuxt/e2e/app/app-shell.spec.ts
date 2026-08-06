import { backendConfigured, expect, test } from '../support/fixtures'

// Authenticated matrix (chromium project, reuses setup storageState). Backend-gated until
// the seeded fixture lands in P2.
test.describe('app shell', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the dashboard shell with navigation', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Roles' })).toBeVisible()
  })

  test('navigates to the users workspace', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page).toHaveURL(/\/app\/users/)
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
  })
})
