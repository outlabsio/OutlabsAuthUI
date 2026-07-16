import type { Locator, Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { selectBaseUiOption } from '../support/base-ui-select'
import { typeIntoBaseUiField, typeIntoBaseUiTagField } from '../support/base-ui-text'

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

const calendarMonthLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function formatCalendarDay(year: number, month: number, day: number) {
  // Match CalendarDayButton's data-day formatting (runtime locale, not forced en-US).
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString()
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

  const calendar = page.getByRole('navigation', { name: 'Navigation bar' }).locator('..')
  const monthCombobox = calendar.getByRole('combobox', { name: 'Choose the Month' })
  const yearCombobox = calendar.getByRole('combobox', { name: 'Choose the Year' })

  await monthCombobox.selectOption({ label: calendarMonthLabels[month - 1] })
  await yearCombobox.selectOption({ label: String(year) })

  await page
    .locator(`button[data-day="${formatCalendarDay(year, month, day)}"]`)
    .first()
    .click()

  // Calendar month/year portal can linger and intercept the time control.
  await page.keyboard.press('Escape')
  await expect(field.getByRole('combobox', { name: 'Select time' })).toBeVisible()

  await field.getByRole('combobox', { name: 'Select time' }).click()
  await page.getByRole('option', { name: timeLabel, exact: true }).click()
}

async function selectEntityStatus(
  dialog: Locator,
  status: 'Active' | 'Inactive' | 'Archived'
) {
  await dialog
    .getByRole('group', { name: 'Status' })
    .getByRole('button', { name: status, exact: true })
    .click()
}

async function selectAllowedChildClass(
  dialog: Locator,
  className: 'Structural' | 'Access group'
) {
  await dialog
    .getByRole('group', { name: 'Allowed child classes' })
    .getByRole('checkbox', { name: className, exact: true })
    .click()
}

test.describe('Entities Workspace', () => {
  test('admin can create a configured root and descendant entities with constrained child options', async ({
    page,
  }) => {
    test.setTimeout(90_000)

    const rootEntity = buildEntitySeed('playwright-root')
    const regionEntity = buildEntitySeed('playwright-region')
    const teamEntity = buildEntitySeed('playwright-team')

    await gotoEntitiesWorkspace(page)
    await page.getByRole('button', { name: 'Create root' }).click()

    const rootDialog = page.getByRole('dialog', { name: 'Create root entity' })
    await expect(rootDialog).toBeVisible()

    await typeIntoBaseUiField(rootDialog, 'System name', rootEntity.systemName)
    await typeIntoBaseUiField(rootDialog, 'Display name', rootEntity.displayName)
    await expect(rootDialog.getByRole('combobox', { name: 'Entity type' })).toContainText(
      /organization/i
    )
    await selectEntityStatus(rootDialog, 'Inactive')
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
    await selectAllowedChildClass(rootDialog, 'Structural')
    await typeIntoBaseUiTagField(rootDialog, 'Allowed child types', ['region'])
    await typeIntoBaseUiField(rootDialog, 'Max members', '22')
    await rootDialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(rootDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: rootEntity.displayName })).toBeVisible()
    await expect(page.getByText(rootEntity.description)).toBeVisible()
    await expect(page.getByText('Inactive').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Configuration snapshot' }).click()
    await expect(page.getByText('0 direct', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Root governance' }).click()
    await expect(page.getByText('22 members', { exact: true })).toBeVisible()
    await expect(page.getByText('Region', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Edit root governance' }).click()
    const rootGovernanceDialog = page.getByRole('dialog', {
      name: `Edit root governance for ${rootEntity.displayName}`,
    })
    await expect(rootGovernanceDialog).toBeVisible()
    await expect(rootGovernanceDialog.locator('#root-governance-max-members')).toHaveValue(
      '22'
    )
    await expect(rootGovernanceDialog.getByText('region', { exact: true })).toBeVisible()
    await rootGovernanceDialog.getByRole('button', { name: 'Cancel' }).click()

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
    await selectAllowedChildClass(regionDialog, 'Access group')
    await typeIntoBaseUiTagField(regionDialog, 'Allowed child types', ['team'])
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
    await expect(dialog.getByRole('combobox', { name: 'Entity type' })).toContainText(
      /organization/i
    )
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

  test('admin can add a user to a newly created child entity and manage that access from the user workspace', async ({
    page,
  }) => {
    const officeEntity = buildEntitySeed('playwright-membership-office')
    const initialReason = `Playwright membership note ${Date.now()}`
    const updatedReason = `${initialReason} restored`

    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'East Coast Region', 'East Coast Region')

    await page.getByRole('tab', { name: 'Child entities' }).click()
    await page.getByRole('button', { name: 'Create child' }).click()

    const officeDialog = page.getByRole('dialog', {
      name: 'Create child entity under East Coast Region',
    })
    await expect(officeDialog).toBeVisible()
    await expect(
      officeDialog.getByText('This parent scope only allows office.')
    ).toBeVisible()
    await typeIntoBaseUiField(officeDialog, 'System name', officeEntity.systemName)
    await typeIntoBaseUiField(officeDialog, 'Display name', officeEntity.displayName)
    await typeIntoBaseUiField(officeDialog, 'Description', officeEntity.description)
    await officeDialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(officeDialog).toBeHidden()

    const regionChildrenPanel = page.getByRole('tabpanel', { name: 'Child entities' })
    const officeChildButton = regionChildrenPanel.getByRole('button', {
      name: new RegExp(officeEntity.displayName, 'i'),
    })
    await expect(officeChildButton).toBeVisible()
    await officeChildButton.focus()
    await officeChildButton.press('Enter')

    await expect(page.getByRole('heading', { name: officeEntity.displayName })).toBeVisible()
    await page.getByRole('tab', { name: 'Members and access' }).click()
    await page.getByRole('button', { name: 'Add member' }).click()

    const addMemberDialog = page.getByRole('dialog', {
      name: `Add member to ${officeEntity.displayName}`,
    })
    await expect(addMemberDialog).toBeVisible()

    await addMemberDialog.locator('#entity-member-search').fill('commercial@sf.acme.com')
    const commercialUserButton = addMemberDialog.getByRole('button').filter({
      hasText: 'commercial@sf.acme.com',
    }).first()
    await expect(commercialUserButton).toBeVisible()
    await commercialUserButton.click()
    await addMemberDialog.getByRole('checkbox', { name: 'Agent' }).click()
    await selectBaseUiOption({
      page,
      container: addMemberDialog,
      fieldLabel: 'Status',
      optionName: 'Suspended',
    })
    await typeIntoBaseUiField(addMemberDialog, 'Lifecycle note', initialReason)
    await addMemberDialog.getByRole('button', { name: 'Add member' }).click()
    await expect(addMemberDialog).toBeHidden()

    const membersPanel = page.getByRole('tabpanel', { name: 'Members and access' })
    const memberRow = membersPanel.locator('tbody tr').filter({
      hasText: 'commercial@sf.acme.com',
    }).first()
    await expect(memberRow).toBeVisible()
    await expect(memberRow.getByText('Suspended', { exact: true })).toBeVisible()
    await expect(memberRow.getByText('Agent', { exact: true })).toBeVisible()

    await memberRow.getByRole('button', { name: 'Open user' }).click()
    await expect(page).toHaveURL(/\/app\/users\/.+tab=access/)
    await expect(
      page.getByRole('tab', { name: 'Memberships and access' })
    ).toHaveAttribute('aria-selected', 'true')

    const membershipsSection = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'Entity memberships' }),
      })
      .first()
    const membershipCard = membershipsSection
      .locator('div.rounded-lg.border')
      .filter({
        has: page.getByText(officeEntity.displayName, { exact: true }),
      })
      .first()

    await expect(membershipCard).toBeVisible()
    await expect(membershipCard.getByText('Suspended', { exact: true })).toBeVisible()
    await membershipCard.getByRole('button', { name: 'Manage access' }).click()

    const manageDialog = page.getByRole('dialog', { name: 'Manage entity access' })
    await expect(manageDialog).toBeVisible()
    await selectBaseUiOption({
      page,
      container: manageDialog,
      fieldLabel: 'Status',
      optionName: 'Active',
    })
    await typeIntoBaseUiField(manageDialog, 'Lifecycle note', updatedReason)

    const windowEnd = new Date()
    windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 2)
    const endYear = windowEnd.getUTCFullYear()
    const endMonth = windowEnd.getUTCMonth() + 1
    const endDay = Math.min(15, windowEnd.getUTCDate())

    await setEntityDialogDateTime({
      dialog: manageDialog,
      page,
      buttonId: 'membership-lifecycle-valid-until',
      year: endYear,
      month: endMonth,
      day: endDay,
      timeLabel: '12:00 PM',
    })
    await manageDialog.getByRole('button', { name: 'Save access' }).click()
    await expect(manageDialog).toBeHidden()

    await expect(membershipCard.getByText('Active', { exact: true }).first()).toBeVisible()
    await expect(membershipCard.getByText(updatedReason, { exact: true })).toBeVisible()
    await expect(membershipCard.getByText('Always on', { exact: true })).toHaveCount(0)
    await expect(membershipCard.getByText(/->/)).toBeVisible()

    await membershipCard.getByRole('button', { name: 'Manage access' }).click()
    await expect(manageDialog).toBeVisible()
    await manageDialog
      .locator('#membership-lifecycle-valid-until')
      .locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]')
      .getByRole('button', { name: 'Clear date' })
      .click()
    await manageDialog.getByRole('button', { name: 'Save access' }).click()
    await expect(manageDialog).toBeHidden()
    await expect(membershipCard.getByText('Always on', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Back to entity' }).click()
    await expect(page).toHaveURL(/\/app\/entities(?:\/[^?]+)?(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: officeEntity.displayName })).toBeVisible()
    await page.getByRole('tab', { name: 'Members and access' }).click()
    await expect(memberRow.getByText('Active', { exact: true }).first()).toBeVisible()
    await expect(memberRow.getByText('Until Open-ended', { exact: true })).toBeVisible()
  })

  test('admin can inspect the hierarchy and edit an entity description before restoring it', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'San Francisco Office', 'San Francisco Office')

    await expect(page.getByText('Configuration snapshot')).toBeVisible()
    await page.getByRole('tab', { name: 'Members and access' }).click()
    await expect(
      page.getByText('Your account cannot read memberships in this entity.')
    ).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Search loaded members' })).toBeVisible()
    await page.getByRole('tab', { name: 'Configuration snapshot' }).click()
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

  test('entity members open the canonical user access workspace', async ({ page }) => {
    await gotoEntitiesWorkspace(page)

    await page.getByRole('tab', { name: 'Members and access' }).click()

    const membersPanel = page.getByRole('tabpanel', { name: 'Members and access' })
    const adminRow = membersPanel.locator('tbody tr').filter({
      has: page.getByText('admin@acme.com', { exact: true }),
    }).first()

    await expect(adminRow).toBeVisible()
    await adminRow.getByRole('button', { name: 'Open user' }).click()

    await expect(page).toHaveURL(/\/app\/users\/.+tab=access/)
    await expect(
      page.getByRole('tab', { name: 'Memberships and access' })
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Entity memberships')).toBeVisible()

    await page.getByRole('button', { name: 'Back to entity' }).click()

    await expect(page).toHaveURL(/\/app\/entities(?:\/[^?]+)?(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'ACME Realty' })).toBeVisible()
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

  test('admin can archive a root entity', async ({ page }) => {
    const disposableRoot = buildEntitySeed('playwright-lifecycle-delete')

    await gotoEntitiesWorkspace(page)
    await page.getByRole('button', { name: 'Create root' }).click()

    const disposableRootDialog = page.getByRole('dialog', { name: 'Create root entity' })
    await expect(disposableRootDialog).toBeVisible()
    await typeIntoBaseUiField(disposableRootDialog, 'System name', disposableRoot.systemName)
    await typeIntoBaseUiField(disposableRootDialog, 'Display name', disposableRoot.displayName)
    await disposableRootDialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(disposableRootDialog).toBeHidden()
    await expect(
      page.getByRole('heading', { name: disposableRoot.displayName })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Archive entity' }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Archive entity' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Archive entity' }).click()
    await expect(deleteDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: disposableRoot.displayName })).toBeVisible()
    await expect(page.getByText('Archived').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive entity' })).toHaveCount(0)
  })

  test('admin can move a child entity under a new parent', async ({ page }) => {
    test.setTimeout(90_000)

    const rootEntity = buildEntitySeed('playwright-lifecycle-root')
    const regionA = buildEntitySeed('playwright-lifecycle-region-a')
    const regionB = buildEntitySeed('playwright-lifecycle-region-b')
    const teamEntity = buildEntitySeed('playwright-lifecycle-team')

    await gotoEntitiesWorkspace(page)
    await page.getByRole('button', { name: 'Create root' }).click()

    const rootDialog = page.getByRole('dialog', { name: 'Create root entity' })
    await expect(rootDialog).toBeVisible()
    await typeIntoBaseUiField(rootDialog, 'System name', rootEntity.systemName)
    await typeIntoBaseUiField(rootDialog, 'Display name', rootEntity.displayName)
    await selectAllowedChildClass(rootDialog, 'Structural')
    await typeIntoBaseUiTagField(rootDialog, 'Allowed child types', ['region'])
    await rootDialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(rootDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: rootEntity.displayName })).toBeVisible()

    async function createRegionChild(seed: ReturnType<typeof buildEntitySeed>) {
      await page.getByRole('tab', { name: 'Child entities' }).click()
      await page.getByRole('button', { name: 'Create child' }).click()
      const regionDialog = page.getByRole('dialog', {
        name: `Create child entity under ${rootEntity.displayName}`,
      })
      await expect(regionDialog).toBeVisible()
      await typeIntoBaseUiField(regionDialog, 'System name', seed.systemName)
      await typeIntoBaseUiField(regionDialog, 'Display name', seed.displayName)
      await selectAllowedChildClass(regionDialog, 'Access group')
      await typeIntoBaseUiTagField(regionDialog, 'Allowed child types', ['team'])
      await regionDialog.getByRole('button', { name: 'Create entity' }).click()
      await expect(regionDialog).toBeHidden()
    }

    await createRegionChild(regionA)
    await createRegionChild(regionB)

    await page.getByRole('tab', { name: 'Child entities' }).click()
    await page
      .getByRole('tabpanel', { name: 'Child entities' })
      .getByRole('button', { name: new RegExp(regionA.displayName, 'i') })
      .click()
    await expect(page.getByRole('heading', { name: regionA.displayName })).toBeVisible()

    await page.getByRole('tab', { name: 'Child entities' }).click()
    await page.getByRole('button', { name: 'Create child' }).click()
    const teamDialog = page.getByRole('dialog', {
      name: `Create child entity under ${regionA.displayName}`,
    })
    await expect(teamDialog).toBeVisible()
    await typeIntoBaseUiField(teamDialog, 'System name', teamEntity.systemName)
    await typeIntoBaseUiField(teamDialog, 'Display name', teamEntity.displayName)
    await teamDialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(teamDialog).toBeHidden()

    await page.getByRole('tab', { name: 'Child entities' }).click()
    await page
      .getByRole('tabpanel', { name: 'Child entities' })
      .getByRole('button', { name: new RegExp(teamEntity.displayName, 'i') })
      .click()
    await expect(page.getByRole('heading', { name: teamEntity.displayName })).toBeVisible()

    await page.getByRole('button', { name: 'Move entity' }).click()
    const moveDialog = page.getByRole('dialog', { name: 'Move entity' })
    await expect(moveDialog).toBeVisible()
    await moveDialog.getByRole('combobox', { name: 'New parent' }).click()
    await page.getByRole('option', { name: regionB.displayName, exact: true }).click()
    await moveDialog.getByRole('button', { name: 'Move entity' }).click()
    await expect(moveDialog).toBeHidden()

    await expect(page.getByRole('heading', { name: teamEntity.displayName })).toBeVisible()
    await expect(page.getByText(regionB.displayName).first()).toBeVisible()

    await selectEntityFromTree(page, regionB.displayName, regionB.displayName)
    await page.getByRole('tab', { name: 'Child entities' }).click()
    await expect(
      page
        .getByRole('tabpanel', { name: 'Child entities' })
        .getByRole('button', { name: new RegExp(teamEntity.displayName, 'i') })
    ).toBeVisible()
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
    await expect
      .poll(() => new URL(page.url()).searchParams.get('status'))
      .toBe('invited')

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

  test.describe('Branch isolation UX', () => {
    test.use({ persona: 'eastAdmin' })

    test('east coast admin stays locked to ACME, can inspect sibling branches, and cannot manage entity structure or memberships', async ({
      page,
    }) => {
      await gotoEntitiesWorkspace(page)

      await expect(page.getByText('Scope locked')).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Root scope' })).toHaveCount(0)

      await selectEntityFromTree(page, 'East Coast Region', 'East Coast Region')

      const searchField = page.getByRole('textbox', { name: 'Search this hierarchy' })
      await searchField.fill('West Coast Region')
      await expect(page.getByRole('button', { name: /West Coast Region/i })).toBeVisible()

      await searchField.fill('Summit Commercial')
      await expect(page.getByRole('button', { name: /Summit Commercial/i })).toHaveCount(0)

      await searchField.fill('')
      await expect(searchField).toHaveValue('')

      await expect(page.getByRole('button', { name: 'Edit entity' })).toHaveCount(0)
      await page.getByRole('tab', { name: 'Child entities' }).click()
      await expect(page.getByRole('button', { name: 'Create child' })).toHaveCount(0)
      await page.getByRole('tab', { name: 'Members and access' }).click()
      await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(0)
      await page.getByRole('tab', { name: 'Roles' }).click()
      await expect(page.getByRole('button', { name: 'Create role here' })).toBeVisible()
    })
  })

  test.describe('Second root UX', () => {
    test.use({ persona: 'summitAdmin' })

    test('summit admin stays locked to the second root and cannot discover ACME entities', async ({
      page,
    }) => {
      await gotoEntitiesWorkspace(page)

      await expect(page.getByText('Scope locked')).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Root scope' })).toHaveCount(0)

      await selectEntityFromTree(page, 'Austin Growth Team', 'Austin Growth Team')

      const searchField = page.getByRole('textbox', { name: 'Search this hierarchy' })
      await searchField.fill('ACME Realty')
      await expect(
        page.getByRole('button', { name: /ACME Realty/i })
      ).toHaveCount(0)
    })
  })
})
