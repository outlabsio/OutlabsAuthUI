import type { Locator, Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { selectBaseUiOption } from '../support/base-ui-select'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const entitiesPath = '/app/entities'
async function gotoEntitiesWorkspace(page: Page) {
  await page.goto(entitiesPath)

  await expect(page).toHaveURL(/\/app\/entities(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open Entities guide' })).toBeVisible()
  await expect(page.getByText('Hierarchy navigator')).toBeVisible()
}

async function selectEntityFromTree(page: Page, searchValue: string, entityName: string) {
  const searchField = page.getByRole('textbox', { name: 'Search this hierarchy' })

  await searchField.fill(searchValue)
  await expect(searchField).toHaveValue(searchValue)

  const treeRow = page
    .getByRole('button', {
      name: new RegExp(entityName, 'i'),
    })
    .first()

  await expect(treeRow).toBeVisible()
  await treeRow.click()
  await expect(
    page.getByRole('heading', {
      name: entityName,
    })
  ).toBeVisible()
}

function buildEntitySeed(prefix: string) {
  const token = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`

  return {
    systemName: `${prefix}-${token}`,
    displayName: `${prefix
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')} ${token}`,
    description: `Playwright ${prefix} description ${token}`,
  }
}

function formatCalendarDay(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString('en-US')
}

async function setEntityDialogDateTime({
  dialog,
  page,
  buttonId,
  year,
  month,
  day,
  timeLabel,
}: {
  dialog: Locator
  page: Page
  buttonId: string
  year: number
  month: number
  day: number
  timeLabel: string
}) {
  const field = dialog
    .locator(`#${buttonId}`)
    .locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]')
  const dateButton = field.locator(`#${buttonId}`)

  await dateButton.click()
  await page.locator(`button[data-day="${formatCalendarDay(year, month, day)}"]`).first().click()
  await field.getByRole('combobox', { name: 'Select time' }).click()
  await page.getByRole('option', { name: timeLabel, exact: true }).click()
}

test.describe('Entities Workspace', () => {
  test('admin can create a configured root and descendant entities with constrained child options', async ({
    page,
  }) => {
    const rootEntity = buildEntitySeed('playwright-root')
    const regionEntity = buildEntitySeed('playwright-region')
    const teamEntity = buildEntitySeed('playwright-team')

    await gotoEntitiesWorkspace(page)
    await page.getByRole('button', { name: 'Create root' }).click()

    const rootDialog = page.getByRole('dialog', { name: 'Create root entity' })
    await expect(rootDialog).toBeVisible()

    await typeIntoBaseUiField(rootDialog, 'System name', rootEntity.systemName)
    await typeIntoBaseUiField(rootDialog, 'Display name', rootEntity.displayName)
    await typeIntoBaseUiField(rootDialog, 'Entity type', 'brokerage')
    await selectBaseUiOption({
      page,
      container: rootDialog,
      fieldLabel: 'Status',
      optionName: 'Inactive',
    })
    await typeIntoBaseUiField(rootDialog, 'Description', rootEntity.description)
    await setEntityDialogDateTime({
      dialog: rootDialog,
      page,
      buttonId: 'entity-valid-from',
      year: 2026,
      month: 3,
      day: 21,
      timeLabel: '12:00 PM',
    })
    await setEntityDialogDateTime({
      dialog: rootDialog,
      page,
      buttonId: 'entity-valid-until',
      year: 2026,
      month: 3,
      day: 28,
      timeLabel: '12:00 PM',
    })
    await rootDialog.getByRole('checkbox', { name: 'Structural' }).click()
    await typeIntoBaseUiField(rootDialog, 'Allowed child types', 'region')
    await typeIntoBaseUiField(rootDialog, 'Max members', '22')
    await rootDialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(rootDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: rootEntity.displayName })).toBeVisible()
    await expect(page.getByText(rootEntity.description)).toBeVisible()
    await expect(page.getByText('Inactive').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Configuration snapshot' }).click()
    await expect(page.getByText('22 members', { exact: true })).toBeVisible()
    await expect(page.getByText('Region', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Edit entity' }).click()
    const editRootDialog = page.getByRole('dialog', {
      name: `Edit ${rootEntity.displayName}`,
    })
    await expect(editRootDialog.locator('#entity-description')).toHaveValue(
      rootEntity.description
    )
    await expect(editRootDialog.locator('#entity-max-members')).toHaveValue('22')
    await expect(editRootDialog.locator('#entity-allowed-child-types')).toHaveValue(
      'region'
    )
    await expect(editRootDialog.locator('#entity-valid-from')).toContainText(
      /March 21.*2026/
    )
    await expect(editRootDialog.locator('#entity-valid-until')).toContainText(
      /March 28.*2026/
    )
    await editRootDialog.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('tab', { name: 'Child entities' }).click()
    await page.getByRole('button', { name: 'Create child' }).click()
    const regionDialog = page.getByRole('dialog', {
      name: `Create child entity under ${rootEntity.displayName}`,
    })
    await expect(regionDialog).toBeVisible()
    await expect(
      regionDialog.getByText('This parent scope only allows region.')
    ).toBeVisible()
    await expect(
      regionDialog.getByText('This parent scope allows structural.')
    ).toBeVisible()

    await typeIntoBaseUiField(regionDialog, 'System name', regionEntity.systemName)
    await typeIntoBaseUiField(regionDialog, 'Display name', regionEntity.displayName)
    await typeIntoBaseUiField(regionDialog, 'Description', regionEntity.description)
    await regionDialog.getByRole('checkbox', { name: 'Access group' }).click()
    await typeIntoBaseUiField(regionDialog, 'Allowed child types', 'team')
    await typeIntoBaseUiField(regionDialog, 'Max members', '8')
    await regionDialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(regionDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: rootEntity.displayName })).toBeVisible()
    await page.getByRole('tab', { name: 'Child entities' }).click()
    const rootChildrenPanel = page.getByRole('tabpanel', { name: 'Child entities' })
    const regionChildButton = rootChildrenPanel.getByRole('button', {
      name: new RegExp(regionEntity.displayName, 'i'),
    })
    await expect(regionChildButton).toBeVisible()
    await regionChildButton.click()

    await expect(page.getByRole('heading', { name: regionEntity.displayName })).toBeVisible()
    await page.getByRole('tab', { name: 'Configuration snapshot' }).click()
    const regionConfigurationPanel = page.getByRole('tabpanel', {
      name: 'Configuration snapshot',
    })
    await expect(regionConfigurationPanel.getByText('8 members', { exact: true })).toBeVisible()
    await expect(regionConfigurationPanel.getByText('Team', { exact: true })).toBeVisible()
    await expect(regionConfigurationPanel.getByText(/Access Group/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Child entities' }).click()
    await page.getByRole('button', { name: 'Create child' }).click()
    const teamDialog = page.getByRole('dialog', {
      name: `Create child entity under ${regionEntity.displayName}`,
    })
    await expect(teamDialog).toBeVisible()
    await expect(
      teamDialog.getByText('This parent scope only allows team.')
    ).toBeVisible()
    await expect(
      teamDialog.getByText('This parent scope allows access group.')
    ).toBeVisible()

    await typeIntoBaseUiField(teamDialog, 'System name', teamEntity.systemName)
    await typeIntoBaseUiField(teamDialog, 'Display name', teamEntity.displayName)
    await typeIntoBaseUiField(teamDialog, 'Description', teamEntity.description)
    await teamDialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(teamDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: regionEntity.displayName })).toBeVisible()
    await page.getByRole('tab', { name: 'Child entities' }).click()
    const regionChildrenPanel = page.getByRole('tabpanel', { name: 'Child entities' })
    const teamChildButton = regionChildrenPanel.getByRole('button', {
      name: new RegExp(teamEntity.displayName, 'i'),
    })
    await expect(teamChildButton).toBeVisible()
    await teamChildButton.click()

    await expect(page.getByRole('heading', { name: teamEntity.displayName })).toBeVisible()
    await expect(page.getByText(teamEntity.description)).toBeVisible()
    await expect(page.getByText(/Access Group/i).first()).toBeVisible()
    await page.getByRole('tab', { name: 'Configuration snapshot' }).click()
    await expect(
      page.getByRole('tabpanel', { name: 'Configuration snapshot' }).getByText('Team', {
        exact: true,
      })
    ).toBeVisible()
  })

  test('entity creation validates lifecycle windows and max members before submit', async ({
    page,
  }) => {
    const invalidEntity = buildEntitySeed('playwright-invalid-root')

    await gotoEntitiesWorkspace(page)
    await page.getByRole('button', { name: 'Create root' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create root entity' })
    await expect(dialog).toBeVisible()

    await typeIntoBaseUiField(dialog, 'System name', invalidEntity.systemName)
    await typeIntoBaseUiField(dialog, 'Display name', invalidEntity.displayName)
    await typeIntoBaseUiField(dialog, 'Entity type', 'brokerage')
    await typeIntoBaseUiField(dialog, 'Max members', '0')
    await setEntityDialogDateTime({
      dialog,
      page,
      buttonId: 'entity-valid-from',
      year: 2026,
      month: 3,
      day: 24,
      timeLabel: '9:00 AM',
    })
    await setEntityDialogDateTime({
      dialog,
      page,
      buttonId: 'entity-valid-until',
      year: 2026,
      month: 3,
      day: 20,
      timeLabel: '9:00 AM',
    })
    await dialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(
      dialog.getByText('Max members must be a whole number greater than zero.')
    ).toBeVisible()
    await expect(
      dialog.getByText('Valid until must be after valid from.')
    ).toBeVisible()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('admin can inspect the hierarchy and edit an entity description before restoring it', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'San Francisco Office', 'San Francisco Office')

    await expect(page.getByText('Configuration snapshot')).toBeVisible()
    await page.getByRole('button', { name: 'Hide hierarchy' }).click()
    await expect(page.getByText('Hierarchy navigator')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show hierarchy' }).click()
    await expect(page.getByText('Hierarchy navigator')).toBeVisible()

    await page.getByRole('button', { name: 'Edit entity' }).click()

    const dialog = page.getByRole('dialog', { name: 'Edit San Francisco Office' })
    const descriptionField = dialog.locator('#entity-description')
    const originalDescription = await descriptionField.inputValue()
    const updatedDescription = `Playwright entity description ${Date.now()}`

    await typeIntoBaseUiField(dialog, 'Description', updatedDescription)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    await page.getByRole('button', { name: 'Edit entity' }).click()
    const restoreDialog = page.getByRole('dialog', { name: 'Edit San Francisco Office' })

    await typeIntoBaseUiField(restoreDialog, 'Description', originalDescription)
    await restoreDialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(restoreDialog).toBeHidden()

    await page.getByRole('button', { name: 'Edit entity' }).click()
    const verifyDialog = page.getByRole('dialog', { name: 'Edit San Francisco Office' })
    await expect(verifyDialog.locator('#entity-description')).toHaveValue(originalDescription)
    await verifyDialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('admin can switch root scope and inspect the second organization hierarchy', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)

    const rootScopeField = page.locator('#entities-root-scope')
    await rootScopeField.fill('Summit Commercial')
    await page.getByRole('option', { name: /Summit Commercial/i }).click()

    await expect(rootScopeField).toHaveValue('Summit Commercial')
    await selectEntityFromTree(page, 'Austin Office', 'Austin Office')
    await expect(page.getByText('Austin commercial sales office.')).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: /ACME Realty/i,
      })
    ).toHaveCount(0)
  })

  test('admin can create and edit an entity-scoped role from the roles tab', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const displayName = `Playwright Office Role ${timestamp}`
    const systemName = `playwright_office_role_${timestamp}`
    const updatedDescription = `Updated office role ${timestamp}`

    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'San Francisco Office', 'San Francisco Office')

    await page.getByRole('tab', { name: 'Roles' }).click()
    await page.getByRole('button', { name: 'Create role here' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create role' })
    await expect(dialog).toBeVisible()
    await typeIntoBaseUiField(dialog, 'Display name', displayName)
    await typeIntoBaseUiField(dialog, 'System name', systemName)
    await typeIntoBaseUiField(
      dialog,
      'How should admins use this role?',
      'Created from the San Francisco Office entity context.'
    )
    await selectBaseUiOption({
      page,
      container: dialog,
      fieldLabel: 'Scope mode',
      optionName: 'Entity only',
    })
    await dialog.getByRole('checkbox', { name: /Role Read/i }).first().click()
    await dialog.getByRole('checkbox', { name: 'Office' }).click()
    await dialog.getByRole('button', { name: 'Create role' }).click()

    await expect(dialog).toBeHidden()

    const createdRoleRow = page.locator('tbody tr').filter({
      has: page.getByText(displayName, { exact: true }),
    }).first()
    await expect(createdRoleRow).toBeVisible()
    await createdRoleRow.click()

    await expect(page.getByRole('button', { name: 'Edit role' })).toBeVisible()
    await page.getByRole('button', { name: 'Edit role' }).click()

    const editDialog = page.getByRole('dialog', { name: `Edit ${displayName}` })
    await expect(editDialog).toBeVisible()
    await typeIntoBaseUiField(editDialog, 'How should admins use this role?', updatedDescription)
    await editDialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(editDialog).toBeHidden()
    await expect(createdRoleRow.getByText(updatedDescription)).toBeVisible()
  })

  test('admin can invite a member from members and access and verify it in users', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const invitedEmail = `playwright-entity-invite-${timestamp}@example.com`

    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'San Francisco Office', 'San Francisco Office')

    await page.getByRole('tab', { name: 'Members and access' }).click()
    await page.getByRole('button', { name: 'Invite member' }).click()

    const dialog = page.getByRole('dialog', {
      name: 'Invite new member to San Francisco Office',
    })
    await expect(dialog).toBeVisible()

    const emailField = dialog.locator('#entity-member-invite-email')
    const firstNameField = dialog.locator('#entity-member-invite-first-name')
    const lastNameField = dialog.locator('#entity-member-invite-last-name')

    await emailField.fill(invitedEmail)
    await firstNameField.fill('Playwright')
    await lastNameField.fill('Invite')
    await expect(emailField).toHaveValue(invitedEmail)
    await expect(firstNameField).toHaveValue('Playwright')
    await expect(lastNameField).toHaveValue('Invite')
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog).toBeHidden()

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Users guide' })).toBeVisible()

    const searchField = page.getByPlaceholder('Search people by name or email')
    await searchField.fill(invitedEmail)
    await page.getByRole('combobox', { name: 'Filter by status' }).click()
    await page.getByRole('option', { name: 'Invited' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()

    const invitedRow = page.locator('tbody tr').filter({ hasText: invitedEmail }).first()
    await expect(invitedRow).toBeVisible()
    await expect(invitedRow.getByText(/^invited$/i)).toBeVisible()
    await expect(invitedRow.getByText('ACME Realty', { exact: true })).toBeVisible()
  })

  test.describe('Scoped admin UX', () => {
    test.use({ persona: 'orgAdmin' })

    test('root-scoped admin is locked to one root scope and can inspect nested entities', async ({
      page,
    }) => {
      await gotoEntitiesWorkspace(page)

      await expect(page.getByText('Scope locked')).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Root scope' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create root' })).toHaveCount(0)
      await expect(page.getByText('ACME Realty', { exact: true }).first()).toBeVisible()

      await selectEntityFromTree(page, 'West Coast Region', 'West Coast Region')
      await expect(page.getByRole('button', { name: 'Edit entity' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create child' })).toHaveCount(0)
      await page.getByRole('tab', { name: 'Members and access' }).click()
      await expect(page.getByRole('button', { name: 'Invite member' })).toBeVisible()
      await expect(page.getByText('Root scope')).toBeVisible()
    })
  })
})
