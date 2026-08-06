import { backendConfigured, expect, test } from '../support/fixtures'

// P2 account vertical (authenticated matrix).
test.describe('account workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders profile, password and sessions', async ({ page }) => {
    await page.goto('/app/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible()
    // Email is pre-filled read-only from the restored session.
    await expect(page.getByLabel('Email')).toHaveValue('admin@acme.com')
  })

  test('validates the password confirmation', async ({ page }) => {
    await page.goto('/app/account')
    await page.getByLabel('Current password').fill('whatever')
    await page.getByLabel('New password', { exact: true }).fill('longenough1')
    await page.getByLabel('Confirm new password').fill('doesnotmatch1')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
  })
})
