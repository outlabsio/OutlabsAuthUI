import { expect, test } from '../support/auth-fixture'

test.describe('Operational Access Control', () => {
  test.use({ persona: 'agent' })

  test('agent can use account while API keys and admin catalogs stay denied', async ({
    page,
  }) => {
    await page.goto('/app/dashboard')

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()

    await page.goto('/app/account')
    await expect(page).toHaveURL(/\/app\/account$/)
    await expect(page.getByRole('button', { name: 'Open Account guide' })).toBeVisible()
    await expect(page.locator('#account-email')).toHaveValue('agent@sf.acme.com')

    await page.goto('/app/api-keys')
    await expect(page).toHaveURL(/\/app\/api-keys$/)
    await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create API key' })).toBeVisible()

    await page.goto('/app/users/api-keys')
    await expect(page).toHaveURL(/\/app\/users\/api-keys(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open System API Keys guide' })).toBeVisible()
    await expect(page.getByText('Insufficient permissions')).toBeVisible()

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
    await expect(page.getByText('Insufficient permissions')).toBeVisible()

    await page.goto('/app/roles')
    await expect(page).toHaveURL(/\/app\/roles(?:\?.*)?$/)
    await expect(page.getByText('Insufficient permissions')).toBeVisible()

    await page.goto('/app/permissions')
    await expect(page).toHaveURL(/\/app\/permissions(?:\?.*)?$/)
    await expect(page.getByText('Insufficient permissions')).toBeVisible()

    await page.goto('/app/entities')
    await expect(page).toHaveURL(/\/app\/entities(?:\?.*)?$/)
    await expect(page.getByText('Insufficient permissions')).toBeVisible()
  })
})
