import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { selectBaseUiOption } from '../support/base-ui-select'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const rolesPath = '/app/roles'

async function gotoRolesWorkspace(page: Page) {
  await page.goto(rolesPath)

  await expect(
    page.getByRole('heading', {
      name: 'Roles',
    })
  ).toBeVisible()
  await expect(page.getByText('Role catalog')).toBeVisible()
}

async function openRole(page: Page, roleName: string) {
  const roleCard = page
    .getByRole('button', {
      name: new RegExp(roleName, 'i'),
    })
    .first()

  await expect(roleCard).toBeVisible()
  await roleCard.click()
  await expect(
    page.getByRole('heading', {
      name: roleName,
    })
  ).toBeVisible()
}

function getConditionGroupCard(page: Page, description: string) {
  return page
    .locator('div.rounded-2xl')
    .filter({
      hasText: description,
    })
    .first()
}

function getConditionCard(page: Page, attribute: string) {
  return page
    .locator('div.rounded-2xl')
    .filter({
      has: page.getByText(attribute, { exact: true }),
    })
    .first()
}

test.describe('Roles Workspace', () => {
  test('admin can inspect seeded role types and ABAC details', async ({ page }) => {
    await gotoRolesWorkspace(page)

    await expect(
      page.getByText('Visible everywhere. Managed by superusers only.')
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Open Roles guide' }).click()
    await expect(
      page.getByText('Visible everywhere. Managed by superusers only.')
    ).toBeVisible()
    await expect(
      page.getByText('Owned by one root scope and assignable across that organization.')
    ).toBeVisible()
    await expect(
      page.getByText(
        'Defined at one entity. Scope mode decides whether it stays local or inherits down the tree.'
      )
    ).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    await openRole(page, 'West Coast After Hours Override')
    await expect(page.getByText('ABAC conditions', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Only allow after-hours override from approved backoffice workflows.')
    ).toBeVisible()
    await expect(page.getByText('Restrict to backoffice-originated requests.')).toBeVisible()

    await openRole(page, 'SF Team Default Member')
    await expect(page.getByText('Automatic baseline access')).toBeVisible()
    await expect(page.getByText('Defined at SF Residential Team', { exact: true })).toBeVisible()
  })

  test('admin can create and delete a root-scoped role', async ({ page }) => {
    await gotoRolesWorkspace(page)

    const roleTimestamp = Date.now()
    const displayName = `Playwright Root Role ${roleTimestamp}`
    const systemName = `playwright_root_role_${roleTimestamp}`

    await page.getByRole('button', { name: 'Create role' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create role' })
    await expect(dialog).toBeVisible()

    await typeIntoBaseUiField(dialog, 'Display name', displayName)
    await typeIntoBaseUiField(dialog, 'System name', systemName)
    await typeIntoBaseUiField(
      dialog,
      'How should admins use this role?',
      'Created by Playwright to validate the root-scoped role flow.'
    )

    await selectBaseUiOption({
      page,
      container: dialog,
      fieldLabel: 'Owning organization',
      optionName: 'ACME Realty',
    })

    await dialog.getByRole('checkbox', { name: /Role Read/i }).first().click()
    await dialog.getByRole('button', { name: 'Create role' }).click()

    await expect(
      page.getByRole('heading', {
        name: displayName,
      })
    ).toBeVisible()
    await expect(page.getByText('Owned by ACME Realty', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    const deleteDialog = page.getByRole('dialog', { name: 'Delete role' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Delete role' }).click()

    await expect(
      page.getByRole('heading', {
        name: 'Select a role',
      })
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: new RegExp(displayName, 'i'),
      })
    ).toHaveCount(0)
  })

  test('admin can create, edit, and delete ABAC artifacts on a custom role', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const groupDescription = `Playwright ABAC group ${timestamp}`
    const conditionAttribute = `request.playwright_${timestamp}`
    const initialConditionValue = `seed-${timestamp}`
    const updatedConditionValue = `updated-${timestamp}`
    const updatedConditionDescription = `Playwright ABAC condition ${timestamp} updated`

    await gotoRolesWorkspace(page)
    await openRole(page, 'West Coast After Hours Override')

    try {
      await page.getByRole('button', { name: 'Add group' }).click()

      const groupDialog = page.getByRole('dialog', { name: 'Add condition group' })
      await expect(groupDialog).toBeVisible()
      await selectBaseUiOption({
        page,
        container: groupDialog,
        fieldLabel: 'Operator',
        optionName: 'OR',
      })
      await typeIntoBaseUiField(groupDialog, 'Description', groupDescription)
      await groupDialog.getByRole('button', { name: 'Create group' }).click()
      await expect(groupDialog).toBeHidden()
      await expect(page.getByText(groupDescription, { exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Add condition' }).click()

      const conditionDialog = page.getByRole('dialog', { name: 'Add condition' })
      await expect(conditionDialog).toBeVisible()
      await typeIntoBaseUiField(conditionDialog, 'Attribute path', conditionAttribute)
      await selectBaseUiOption({
        page,
        container: conditionDialog,
        fieldLabel: 'Condition group',
        optionName: 'OR group',
      })
      await typeIntoBaseUiField(conditionDialog, 'Value', initialConditionValue)
      await typeIntoBaseUiField(
        conditionDialog,
        'Description',
        `Playwright ABAC condition ${timestamp}`
      )
      await conditionDialog.getByRole('button', { name: 'Create condition' }).click()
      await expect(conditionDialog).toBeHidden()
      await expect(page.getByText(conditionAttribute, { exact: true })).toBeVisible()
      await expect(page.getByText(initialConditionValue, { exact: true })).toBeVisible()

      const conditionCard = getConditionCard(page, conditionAttribute)
      await conditionCard
        .getByRole('button', { name: `Edit condition ${conditionAttribute}` })
        .click()

      const editConditionDialog = page.getByRole('dialog', { name: 'Edit condition' })
      await expect(editConditionDialog).toBeVisible()
      await typeIntoBaseUiField(editConditionDialog, 'Value', updatedConditionValue)
      await typeIntoBaseUiField(
        editConditionDialog,
        'Description',
        updatedConditionDescription
      )
      await editConditionDialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(editConditionDialog).toBeHidden()
      await expect(page.getByText(updatedConditionValue, { exact: true })).toBeVisible()
      await expect(page.getByText(updatedConditionDescription, { exact: true })).toBeVisible()
    } finally {
      const conditionCard = getConditionCard(page, conditionAttribute)

      if (await conditionCard.isVisible().catch(() => false)) {
        await conditionCard
          .getByRole('button', { name: `Delete condition ${conditionAttribute}` })
          .click()
        await expect(page.getByText(conditionAttribute, { exact: true })).toHaveCount(0)
      }

      const groupCard = getConditionGroupCard(page, groupDescription)

      if (await groupCard.isVisible().catch(() => false)) {
        await groupCard.getByRole('button', { name: 'Delete OR group' }).click()
        await expect(page.getByText(groupDescription, { exact: true })).toHaveCount(0)
      }
    }
  })

  test.describe('Scoped admin UX', () => {
    test.use({ persona: 'regionalAdmin' })

    test('regional admin can manage ACME-scoped roles but cannot create globals or cross-root roles', async ({
      page,
    }) => {
      await gotoRolesWorkspace(page)

      await expect(
        page.getByRole('button', { name: /West Coast Hierarchy Admin/i })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /ACME Org Admin/i })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /SF Office Local Admin/i })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /East Coast Hierarchy Admin/i })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /Summit Org Admin/i })
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: /Scoped Roles Admin/i })
      ).toHaveCount(0)

      await page.getByRole('button', { name: 'Create role' }).click()
      const dialog = page.getByRole('dialog', { name: 'Create role' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Global', { exact: true })).toHaveCount(0)
      await expect(dialog.getByText('Organization', { exact: true })).toBeVisible()
      await expect(dialog.getByText('Entity-defined', { exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel' }).click()
    })
  })

  test.describe('Read-only UX', () => {
    test.use({ persona: 'auditor' })

    test('auditor can inspect roles but not mutate them', async ({ page }) => {
      await gotoRolesWorkspace(page)

      await expect(page.getByRole('button', { name: 'Create role' })).toHaveCount(0)

      await openRole(page, 'ACME Auditor')
      await expect(page.getByRole('button', { name: 'Edit role' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
    })
  })
})
