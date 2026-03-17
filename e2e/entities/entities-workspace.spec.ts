import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
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
      await expect(page.getByText('Working inside ACME Realty.')).toBeVisible()
    })
  })
})
