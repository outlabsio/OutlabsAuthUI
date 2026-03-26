import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { selectBaseUiOption } from '../support/base-ui-select'

const apiKeysPath = '/app/api-keys'

async function gotoApiKeysWorkspace(page: Page) {
  await page.goto(apiKeysPath)

  await expect(page).toHaveURL(/\/app\/api-keys$/)
  await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'API Keys',
    })
  ).toBeVisible()
}

function getApiKeyRow(page: Page, keyName: string) {
  return page
    .locator('tbody tr')
    .filter({
      has: page.getByText(keyName, { exact: true }),
    })
    .first()
}

async function typeIntoApiKeyField(page: Page, selector: string, value: string) {
  const control = page.locator(selector)

  await expect(control).toBeVisible()
  await control.click()
  await control.fill(value)
  await expect(control).toHaveValue(value)
}

async function selectComboboxOption(
  page: Page,
  selector: string,
  searchValue: string,
  optionText: string
) {
  const control = page.locator(selector)

  await expect(control).toBeVisible()
  await control.click()
  await control.fill(searchValue)
  await page
    .locator('[data-slot="combobox-content"]')
    .getByText(optionText, { exact: true })
    .first()
    .click()
}

test.describe('API Keys Workspace', () => {
  test('admin can create, update, rotate, and revoke an API key', async ({ page }) => {
    const timestamp = Date.now()
    const keyName = `Playwright API Key ${timestamp}`

    await gotoApiKeysWorkspace(page)

    await selectComboboxOption(
      page,
      '#api-keys-entity',
      'San Francisco Office',
      'San Francisco Office'
    )

    await page.getByRole('button', { name: 'Create API key' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Create API key' })
    await expect(createDialog).toBeVisible()

    await typeIntoApiKeyField(page, '#api-key-name', keyName)
    await typeIntoApiKeyField(
      page,
      '#api-key-description',
      'Created by Playwright to validate entity-first API key lifecycle parity.'
    )
    const scopeOption = createDialog
      .locator('label')
      .filter({ hasText: /[a-z_]+:[a-z_]+/ })
      .first()
    await expect(scopeOption).toBeVisible()
    await scopeOption.click()
    await createDialog.getByRole('button', { name: 'Create API key' }).click()

    const secretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(secretDialog).toBeVisible()
    await expect(
      secretDialog.getByText('The backend will not show this secret again.')
    ).toBeVisible()
    await secretDialog.getByRole('button', { name: 'Done' }).click()

    const createdRow = getApiKeyRow(page, keyName)
    await expect(createdRow).toBeVisible()
    await createdRow.click()

    await page.getByRole('button', { name: 'Edit key' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit API key' })
    await expect(editDialog).toBeVisible()
    await selectBaseUiOption({
      page,
      container: editDialog,
      fieldLabel: 'Lifecycle',
      optionName: 'Suspended',
    })
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Suspended', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Rotate key' }).click()
    const rotateConfirmDialog = page.getByRole('dialog', { name: 'Rotate API key' })
    await expect(rotateConfirmDialog).toBeVisible()
    await expect(
      rotateConfirmDialog.getByText(
        'Rotating this key creates a replacement secret and revokes the current secret immediately.'
      )
    ).toBeVisible()
    await rotateConfirmDialog.getByRole('button', { name: 'Rotate key' }).click()

    const rotateDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(rotateDialog).toBeVisible()
    await expect(
      rotateDialog.getByText('Rotation creates a replacement key and revokes the old secret immediately.')
    ).toBeVisible()
    await rotateDialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Revoke key' }).click()

    const revokeDialog = page.getByRole('dialog', { name: 'Revoke API key' })
    await expect(revokeDialog).toBeVisible()
    await revokeDialog.getByRole('button', { name: 'Revoke key' }).click()

    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible()
  })
})
