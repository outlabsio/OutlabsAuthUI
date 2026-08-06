import { backendConfigured, expect, test } from '../support/fixtures'

// P2 detail pages — list row links through to the resource detail view.
test.describe('resource detail navigation', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('opens a role detail from the roles list', async ({ page }) => {
    await page.goto('/app/roles')
    await page.getByRole('link', { name: 'Administrator' }).click()
    await expect(page).toHaveURL(/\/app\/roles\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Permissions' })).toBeVisible()
  })

  test('opens a user detail from the users list', async ({ page }) => {
    await page.goto('/app/users')
    // Click whichever user is first — robust to list ordering / accumulated test data.
    await page.getByRole('link', { name: /@/ }).first().click()
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible()
  })

  test('opens an entity detail from the entities list', async ({ page }) => {
    await page.goto('/app/entities')
    await page.getByRole('link', { name: 'ACME Realty' }).click()
    await expect(page).toHaveURL(/\/app\/entities\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Children' })).toBeVisible()
  })
})
