import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'

async function gotoRolesWorkspace(page: Page) {
  await page.goto('/app/roles')

  await expect(page).toHaveURL(/\/app\/roles(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open Roles guide' })).toBeVisible()
}

test.describe('Diverse Roles Access', () => {
  test('superuser can read the roles workspace and open a role details page', async ({
    page,
  }) => {
    await gotoRolesWorkspace(page)

    await expect(
      page.getByText('Your current session cannot read the role catalog.')
    ).toHaveCount(0)
    await expect(page.getByRole('table')).toBeVisible()

    const firstRoleRow = page.locator('tbody tr').first()
    await expect(firstRoleRow).toBeVisible()
    await firstRoleRow.click()

    await expect(page).toHaveURL(/\/app\/roles\/.+/)
    await expect(
      page.getByText('Your current session cannot read the role catalog.')
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Back to roles' })).toBeVisible()
  })
})
