import { expect, test } from '../support/auth-fixture'

function getRow(page: Parameters<typeof test>[0]['page'], name: string) {
  return page
    .locator('tbody tr')
    .filter({
      has: page.getByText(name, { exact: true }),
    })
    .first()
}

async function typeIntoField(
  page: Parameters<typeof test>[0]['page'],
  selector: string,
  value: string
) {
  const control = page.locator(selector)
  await expect(control).toBeVisible()
  await control.click()
  await control.fill(value)
  await expect(control).toHaveValue(value)
}

async function gotoApiKeysWorkspace(page: Parameters<typeof test>[0]['page']) {
  await page.goto('/app/api-keys')

  await expect(page).toHaveURL(/\/app\/api-keys$/)
  await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
}

test.describe('Simple RBAC API Keys Workspace', () => {
  test('admin can create, rotate, and revoke a platform-global integration key', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const principalName = `Playwright Simple Integration ${timestamp}`
    const keyName = `Playwright Simple Key ${timestamp}`

    await gotoApiKeysWorkspace(page)

    await page.getByRole('button', { name: 'Create integration' }).click()

    const createPrincipalDialog = page.getByRole('dialog', {
      name: 'Create integration principal',
    })
    await expect(createPrincipalDialog).toBeVisible()

    await typeIntoField(page, '#integration-principal-name', principalName)
    await typeIntoField(
      page,
      '#integration-principal-description',
      'Created by Playwright to validate SimpleRBAC global integration principals.'
    )
    await typeIntoField(page, '#integration-principal-allowed-scopes', 'user:read')
    await createPrincipalDialog.getByRole('button', { name: 'Create integration' }).click()

    const principalRow = getRow(page, principalName)
    await expect(principalRow).toBeVisible()
    await principalRow.click()

    await page.locator('header').getByRole('button', { name: 'Create system key' }).click()

    const createKeyDialog = page.getByRole('dialog', {
      name: 'Create system integration key',
    })
    await expect(createKeyDialog).toBeVisible()

    await typeIntoField(page, '#system-api-key-name', keyName)
    await typeIntoField(
      page,
      '#system-api-key-description',
      'Created by Playwright to validate SimpleRBAC global system-key lifecycle.'
    )
    await typeIntoField(page, '#system-api-key-scopes', 'user:read')
    await createKeyDialog.getByRole('button', { name: 'Create key' }).click()

    const secretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(secretDialog).toBeVisible()
    await secretDialog.getByRole('button', { name: 'Done' }).click()

    const keyRow = getRow(page, keyName)
    await expect(keyRow).toBeVisible()
    await expect(keyRow.getByText('Active', { exact: true })).toBeVisible()
    await expect(keyRow.getByText('Effective', { exact: true })).toBeVisible()
    await keyRow.click()

    await page.getByRole('button', { name: 'Rotate key' }).click()
    const rotateDialog = page.getByRole('dialog', { name: 'Rotate API key' })
    await expect(rotateDialog).toBeVisible()
    await rotateDialog.getByRole('button', { name: 'Rotate key' }).click()

    const rotatedSecretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(rotatedSecretDialog).toBeVisible()
    await rotatedSecretDialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Revoke key' }).click()
    const revokeDialog = page.getByRole('dialog', { name: 'Revoke API key' })
    await expect(revokeDialog).toBeVisible()
    await revokeDialog.getByRole('button', { name: 'Revoke key' }).click()

    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible()
  })
})
