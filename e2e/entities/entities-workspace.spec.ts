import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { selectBaseUiOption } from '../support/base-ui-select'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const entitiesPath = '/app/entities'

async function gotoEntitiesWorkspace(page: Page) {
  await page.goto(entitiesPath)

  await expect(
    page.getByRole('heading', {
      name: 'Entities',
    })
  ).toBeVisible()
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

test.describe('Entities Workspace', () => {
  test('admin can inspect the hierarchy and edit an entity description before restoring it', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'San Francisco Office', 'San Francisco Office')

    await expect(page.getByText('Entity overview')).toBeVisible()
    await expect(page.getByText('Members and access')).toBeVisible()

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

    await selectBaseUiOption({
      page,
      container: page.locator('body'),
      fieldLabel: 'Root scope',
      optionName: /Summit Commercial/i,
    })

    await expect(page.getByText('Active root')).toBeVisible()
    await selectEntityFromTree(page, 'Austin Office', 'Austin Office')
    await expect(page.getByText('Austin commercial sales office.')).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: /ACME Realty/i,
      })
    ).toHaveCount(0)
  })

  test('admin can invite a member from entity context and verify it in users', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const invitedEmail = `playwright-entity-invite-${timestamp}@example.com`
    const roleName = 'Office Dispatch Coordinator'

    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'San Francisco Office', 'San Francisco Office')

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
    await dialog.getByRole('checkbox', { name: roleName }).click()
    await expect(dialog.getByText('1 selected', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog).toBeHidden()

    await page.goto('/app/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()

    const searchField = page.getByPlaceholder('Search people by name or email')
    await searchField.fill(invitedEmail)
    await page.getByRole('combobox', { name: 'Filter by status' }).click()
    await page.getByRole('option', { name: 'Invited' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()

    const invitedRow = page.locator('tbody tr').filter({ hasText: invitedEmail }).first()
    await expect(invitedRow).toBeVisible()
    await expect(invitedRow.getByText(/^invited$/i)).toBeVisible()
    await expect(invitedRow.getByText('Membership-based', { exact: true })).toBeVisible()
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
      await expect(page.getByRole('button', { name: 'Invite member' })).toBeVisible()
      await expect(page.getByText('Active root')).toBeVisible()
    })
  })
})
