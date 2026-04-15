import { expect, test } from '../support/auth-fixture'
import { selectBaseUiOption } from '../support/base-ui-select'

const systemApiKeysPath = '/app/users/api-keys'

function getIntegrationRow(page: Parameters<typeof test>[0]['page'], name: string) {
  return page
    .locator('tbody tr')
    .filter({
      has: page.getByText(name, { exact: true }),
    })
    .first()
}

async function gotoApiKeysWorkspace(page: Parameters<typeof test>[0]['page']) {
  await page.goto(systemApiKeysPath)

  await expect(page).toHaveURL(/\/app\/users\/api-keys(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open System API Keys guide' })).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'System API Keys',
    })
  ).toBeVisible()
}

async function gotoPersonalApiKeysWorkspace(page: Parameters<typeof test>[0]['page']) {
  await page.goto('/app/api-keys')

  await expect(page).toHaveURL(/\/app\/api-keys$/)
  await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'API Keys',
    })
  ).toBeVisible()
}

async function typeIntoField(
  page: Parameters<typeof test>[0]['page'],
  selector: string,
  value: string
) {
  const control = page.locator(selector)
  await expect(control).toBeVisible()
  await control.scrollIntoViewIfNeeded()
  await control.fill(value)
  await expect(control).toHaveValue(value)
}

async function selectComboboxOption(
  page: Parameters<typeof test>[0]['page'],
  selector: string,
  searchValue: string,
  optionText: string
) {
  const control = page.locator(selector)

  await expect(control).toBeVisible()
  const currentValue = (await control.textContent())?.trim()
  if (currentValue === optionText) {
    return
  }

  await control.click()
  await control.fill(searchValue)
  await page
    .locator('[data-slot="combobox-content"]')
    .getByText(optionText, { exact: true })
    .first()
    .click()
}

async function toggleRole(
  page: Parameters<typeof test>[0]['page'],
  dialogName: string,
  roleName: string,
  checked: boolean
) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  const checkbox = dialog.getByRole('checkbox', { name: roleName }).first()

  await expect(checkbox).toBeVisible()

  if (checked) {
    await checkbox.check()
  } else {
    await checkbox.uncheck()
  }
}

async function setKeyAccessMode(
  page: Parameters<typeof test>[0]['page'],
  mode: 'full' | 'restricted'
) {
  const dialog = page.getByRole('dialog', {
    name: /Create machine API key|Edit machine API key/,
  })
  const label = mode === 'full' ? 'Full service-account access' : 'Restricted access'
  await dialog.getByText(label, { exact: true }).click()
}

async function selectRestrictedPermission(
  page: Parameters<typeof test>[0]['page'],
  permissionLabel: string
) {
  const dialog = page.getByRole('dialog', {
    name: /Create machine API key|Edit machine API key/,
  })
  await dialog.getByRole('textbox', { name: 'Search role permissions' }).fill(permissionLabel)
  await dialog.getByRole('checkbox', { name: permissionLabel }).check()
}

async function createEntityServiceAccount(
  page: Parameters<typeof test>[0]['page'],
  {
    entityName,
    principalName,
    roleName,
  }: {
    entityName: string
    principalName: string
    roleName: string
  }
) {
  await gotoApiKeysWorkspace(page)
  await selectComboboxOption(page, '#api-keys-entity', entityName, entityName)

  await page.getByRole('button', { name: 'Create service account' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create service account' })
  await expect(dialog).toBeVisible()

  await typeIntoField(page, '#integration-principal-name', principalName)
  await typeIntoField(
    page,
    '#integration-principal-description',
    'Created by Playwright to validate the EnterpriseRBAC service-account workflow.'
  )
  await toggleRole(page, 'Create service account', roleName, true)
  await dialog.getByRole('button', { name: 'Create service account' }).click()

  const createdRow = getIntegrationRow(page, principalName)
  await expect(createdRow).toBeVisible()
  await createdRow.click()
}

async function createPlatformGlobalServiceAccount(
  page: Parameters<typeof test>[0]['page'],
  {
    principalName,
    roleName,
  }: {
    principalName: string
    roleName: string
  }
) {
  await gotoApiKeysWorkspace(page)

  await selectBaseUiOption({
    page,
    container: page.locator('body'),
    fieldLabel: 'Scope model',
    optionName: 'Platform global',
  })

  await page.getByRole('button', { name: 'Create service account' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create service account' })
  await expect(dialog).toBeVisible()

  await typeIntoField(page, '#integration-principal-name', principalName)
  await typeIntoField(
    page,
    '#integration-principal-description',
    'Created by Playwright to validate the platform-global service-account workflow.'
  )
  await toggleRole(page, 'Create service account', roleName, true)
  await dialog.getByRole('button', { name: 'Create service account' }).click()

  const createdRow = getIntegrationRow(page, principalName)
  await expect(createdRow).toBeVisible()
  await createdRow.click()
}

async function createMachineKey(
  page: Parameters<typeof test>[0]['page'],
  {
    keyName,
    accessMode,
    permissionLabel,
  }: {
    keyName: string
    accessMode: 'full' | 'restricted'
    permissionLabel?: string
  }
) {
  await page.locator('header').getByRole('button', { name: 'Create machine key' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create machine API key' })
  await expect(dialog).toBeVisible()

  await typeIntoField(page, '#system-api-key-name', keyName)
  await typeIntoField(
    page,
    '#system-api-key-description',
    'Created by Playwright to validate machine-key lifecycle behavior in the UI.'
  )

  if (accessMode === 'restricted') {
    await setKeyAccessMode(page, 'restricted')
    if (permissionLabel) {
      await selectRestrictedPermission(page, permissionLabel)
    }
  }

  await dialog.getByRole('button', { name: 'Create key' }).click()

  const secretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
  await expect(secretDialog).toBeVisible()
  await secretDialog.getByRole('button', { name: 'Done' }).click()

  const keyRow = getIntegrationRow(page, keyName)
  await expect(keyRow).toBeVisible()
  await expect(keyRow.getByText('Active', { exact: true })).toBeVisible()
  await expect(keyRow.getByText('Effective', { exact: true })).toBeVisible()
  await keyRow.click()
}

test.describe('API Keys Workspace', () => {
  test('admin can self-manage a personal API key from the API Keys workspace', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const keyName = `Playwright Personal Key ${timestamp}`

    await gotoPersonalApiKeysWorkspace(page)

    await page.locator('header').getByRole('button', { name: 'Create API key' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create API key' })
    await expect(dialog).toBeVisible()

    await typeIntoField(page, '#api-key-name', keyName)
    await typeIntoField(
      page,
      '#api-key-description',
      'Created by Playwright to validate the self-service personal API key workflow.'
    )

    await selectBaseUiOption({
      page,
      container: dialog,
      fieldLabel: 'Anchor entity',
      optionName: /San Francisco Office$/,
    })
    await dialog.getByText('Allow descendant access from this entity anchor.', { exact: true }).click()

    await dialog.getByText('entity:read_tree', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Create API key' }).click()

    const secretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(secretDialog).toBeVisible()
    await secretDialog.getByRole('button', { name: 'Done' }).click()

    const keyRow = getIntegrationRow(page, keyName)
    await expect(keyRow).toBeVisible()
    await keyRow.click()
    await expect(page.getByText('Descendants allowed', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Edit key' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit API key' })
    await expect(editDialog).toBeVisible()
    await typeIntoField(page, '#api-key-description', 'Updated by Playwright after create.')
    await editDialog.getByRole('button', { name: 'Save changes' }).click()

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

  test('admin can manage an entity service account and revoke its restricted machine key from inventory', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const principalName = `Playwright Entity Service Account ${timestamp}`
    const keyName = `Playwright Entity Key ${timestamp}`

    await createEntityServiceAccount(page, {
      entityName: 'San Francisco Office',
      principalName,
      roleName: 'Office Manager',
    })

    await createMachineKey(page, {
      keyName,
      accessMode: 'restricted',
      permissionLabel: 'Entity Read Tree',
    })

    await page.getByRole('button', { name: 'Rotate key' }).click()
    const rotateDialog = page.getByRole('dialog', { name: 'Rotate API key' })
    await expect(rotateDialog).toBeVisible()
    await rotateDialog.getByRole('button', { name: 'Rotate key' }).click()

    const rotatedSecretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(rotatedSecretDialog).toBeVisible()
    await rotatedSecretDialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Edit service account' }).click()
    const editServiceAccountDialog = page.getByRole('dialog', { name: 'Edit service account' })
    await expect(editServiceAccountDialog).toBeVisible()
    await toggleRole(page, 'Edit service account', 'Office Manager', false)
    await toggleRole(page, 'Edit service account', 'Agent', true)
    await editServiceAccountDialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Ineffective', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('No Effective Scopes', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Entity inventory' }).click()
    await expect(page.getByRole('tab', { name: 'Entity inventory', selected: true })).toBeVisible()
    await typeIntoField(page, '#api-keys-inventory-search', keyName)

    const inventoryRow = getIntegrationRow(page, keyName)
    await expect(inventoryRow).toBeVisible()
    await expect(inventoryRow.getByText('System Integration', { exact: true })).toBeVisible()
    await expect(inventoryRow.getByText('Ineffective', { exact: true })).toBeVisible()
    await inventoryRow.click()

    await expect(page.getByText(principalName, { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Revoke key' }).click()

    const revokeDialog = page.getByRole('dialog', { name: 'Revoke API key' })
    await expect(revokeDialog).toBeVisible()
    await revokeDialog.getByRole('button', { name: 'Revoke key' }).click()

    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible()
  })

  test('admin can create a platform-global service account and inherited machine key', async ({ page }) => {
    const timestamp = Date.now()
    const principalName = `Playwright Global Service Account ${timestamp}`
    const keyName = `Playwright Global Key ${timestamp}`

    await createPlatformGlobalServiceAccount(page, {
      principalName,
      roleName: 'Service Reader',
    })

    await expect(page.getByText('Platform Global', { exact: true }).first()).toBeVisible()

    await createMachineKey(page, {
      keyName,
      accessMode: 'full',
    })

    await expect(page.getByText('Platform Global', { exact: true }).first()).toBeVisible()
    await expect(
      page.getByText('This key inherits all permissions from its service account.')
    ).toBeVisible()
    await expect(page.getByText(keyName, { exact: true }).first()).toBeVisible()
  })
})
