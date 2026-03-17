import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const permissionsPath = '/app/permissions'

async function gotoPermissionsWorkspace(page: Page) {
  await page.goto(permissionsPath)

  await expect(
    page.getByRole('heading', {
      name: 'Permissions',
    })
  ).toBeVisible()
  await expect(page.getByText('Permission catalog')).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
}

function getPermissionRow(page: Page, permissionName: string) {
  return page
    .locator('tbody tr')
    .filter({
      has: page.getByText(permissionName, { exact: true }),
    })
    .first()
}

async function openPermission(page: Page, permissionName: string) {
  const permissionRow = getPermissionRow(page, permissionName)

  await expect(permissionRow).toBeVisible()
  await permissionRow.click()
  await expect(
    page.getByRole('heading', {
      name: permissionName,
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

test.describe('Permissions Workspace', () => {
  test('admin can inspect seeded custom permission and ABAC details', async ({ page }) => {
    await gotoPermissionsWorkspace(page)

    await expect(page.getByText('Permissions are capability atoms')).toHaveCount(0)
    await page.getByRole('button', { name: 'Open Permissions guide' }).click()
    await expect(page.getByRole('heading', { name: 'Permissions guide' })).toBeVisible()
    await expect(page.getByText('Permissions are capability atoms')).toBeVisible()
    await expect(page.getByText('Roles decide scope')).toBeVisible()
    await expect(page.getByText('ABAC narrows runtime use')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    await openPermission(page, 'Lead Escalate After Hours')
    await expect(
      page.getByText('Only allow emergency escalation for urgent, on-call workflows.')
    ).toBeVisible()
    await expect(page.getByText('Require an on-call session context.')).toBeVisible()
    await expect(page.getByText('West Coast After Hours Override')).toBeVisible()

    await openPermission(page, 'Permission Read')
    await expect(page.getByRole('button', { name: 'Edit permission' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
  })

  test('admin can create, edit, and delete a custom permission', async ({ page }) => {
    const timestamp = Date.now()
    const displayName = `Playwright Permission ${timestamp}`
    const updatedDescription = `Updated permission description ${timestamp}`
    const action = `approve_playwright_${timestamp}`

    await gotoPermissionsWorkspace(page)

    await page.getByRole('button', { name: 'Create permission', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await expect(dialog).toBeVisible()

    await typeIntoBaseUiField(dialog, 'Resource', 'playwright')
    await typeIntoBaseUiField(dialog, 'Action', action)
    await typeIntoBaseUiField(dialog, 'Display name', displayName)
    await typeIntoBaseUiField(
      dialog,
      'How should admins use this permission?',
      'Created by Playwright to validate custom permission management.'
    )
    await typeIntoBaseUiField(dialog, 'Tags', 'playwright, qa')

    await dialog.getByRole('button', { name: 'Create permission' }).click()

    await expect(
      page.getByRole('heading', {
        name: displayName,
      })
    ).toBeVisible()
    await expect(
      page.getByText(`playwright:${action}`, { exact: true }).first()
    ).toBeVisible()

    await page.getByRole('button', { name: 'Edit permission' }).click()

    const editDialog = page.getByRole('dialog', { name: `Edit ${displayName}` })
    await expect(editDialog).toBeVisible()
    await typeIntoBaseUiField(
      editDialog,
      'How should admins use this permission?',
      updatedDescription
    )
    await typeIntoBaseUiField(editDialog, 'Tags', 'playwright, regression')
    await editDialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(
      page.locator('p').filter({ hasText: updatedDescription }).first()
    ).toBeVisible()
    await expect(page.getByText('regression')).toBeVisible()

    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    const deleteDialog = page.getByRole('dialog', { name: 'Delete permission' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Delete permission' }).click()

    await expect(
      page.getByRole('heading', {
        name: 'Select a permission',
      })
    ).toBeVisible()
    await expect(
      getPermissionRow(page, displayName)
    ).toHaveCount(0)
  })

  test('admin can create, edit, and delete permission ABAC artifacts', async ({ page }) => {
    const timestamp = Date.now()
    const groupDescription = `Playwright permission ABAC group ${timestamp}`
    const conditionAttribute = `resource.playwright_${timestamp}`
    const initialConditionValue = `seed-${timestamp}`
    const updatedConditionValue = `updated-${timestamp}`
    const updatedConditionDescription = `Playwright permission condition ${timestamp} updated`

    await gotoPermissionsWorkspace(page)
    await openPermission(page, 'Lead Escalate After Hours')

    try {
      await page.getByRole('button', { name: 'Add group' }).click()

      const groupDialog = page.getByRole('dialog', { name: 'Add condition group' })
      await expect(groupDialog).toBeVisible()
      await typeIntoBaseUiField(groupDialog, 'Description', groupDescription)
      await groupDialog.getByRole('button', { name: 'Create group' }).click()
      await expect(groupDialog).toBeHidden()
      await expect(page.getByText(groupDescription, { exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Add condition' }).click()

      const conditionDialog = page.getByRole('dialog', { name: 'Add condition' })
      await expect(conditionDialog).toBeVisible()
      await typeIntoBaseUiField(conditionDialog, 'Attribute path', conditionAttribute)
      await typeIntoBaseUiField(conditionDialog, 'Value', initialConditionValue)
      await typeIntoBaseUiField(
        conditionDialog,
        'Description',
        `Playwright permission condition ${timestamp}`
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
        await groupCard.getByRole('button', { name: 'Delete AND group' }).click()
        await expect(page.getByText(groupDescription, { exact: true })).toHaveCount(0)
      }
    }
  })

  test.describe('Permission admin UX', () => {
    test.use({ persona: 'permissionAdmin' })

    test('permission admin can manage custom permissions without superuser access', async ({
      page,
    }) => {
      const timestamp = Date.now()
      const displayName = `Scoped Permission ${timestamp}`
      const action = `scoped_manage_${timestamp}`

      await gotoPermissionsWorkspace(page)
      await expect(page.getByRole('button', { name: 'Create permission', exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Create permission', exact: true }).click()

      const dialog = page.getByRole('dialog', { name: 'Create permission' })
      await expect(dialog).toBeVisible()
      await typeIntoBaseUiField(dialog, 'Resource', 'playwright')
      await typeIntoBaseUiField(dialog, 'Action', action)
      await typeIntoBaseUiField(dialog, 'Display name', displayName)
      await typeIntoBaseUiField(dialog, 'Tags', 'permissions-admin')
      await dialog.getByRole('button', { name: 'Create permission' }).click()

      await expect(
        page.getByRole('heading', {
          name: displayName,
        })
      ).toBeVisible()

      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      const deleteDialog = page.getByRole('dialog', { name: 'Delete permission' })
      await expect(deleteDialog).toBeVisible()
      await deleteDialog.getByRole('button', { name: 'Delete permission' }).click()

      await expect(
        page.getByRole('heading', {
          name: 'Select a permission',
        })
      ).toBeVisible()
    })
  })
})
