import { backendConfigured, expect, test } from '../support/fixtures'
import { chooseSelect } from '../support/ui-select'

// P2 users vertical — full CRUD row actions against the live backend.
test.describe('users workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('creates then soft-deletes a user (roundtrip)', async ({ page }) => {
    const email = `e2e-crud-${Date.now()}@example.com`
    await page.goto('/app/users')

    // Create (backend requires an initial password).
    await page.getByRole('button', { name: 'Add user' }).click()
    const createDialog = page.getByRole('dialog')
    await createDialog.getByLabel('Email').fill(email)
    await createDialog.getByLabel('Initial password').fill('Testpass1!')
    await createDialog.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('link', { name: email })).toBeVisible()

    // Delete via the row action menu → confirmation → soft-delete (status becomes Deleted).
    const row = page.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: 'User actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()

    // Soft-deleted → gone from the default Active view...
    await page.getByPlaceholder('Search users...').fill(email)
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0)
    // ...but still there under the Deleted filter.
    await chooseSelect(page, 'user-status-filter', 'Deleted')
    await expect(page.getByRole('row').filter({ hasText: email })).toContainText(/deleted/i)
  })

  test('opens the edit dialog from the row menu', async ({ page }) => {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'User actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('Phone')).toBeVisible()
  })
})
