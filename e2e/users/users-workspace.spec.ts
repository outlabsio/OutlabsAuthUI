import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const usersPath = '/app/users'

async function gotoUsersWorkspace(page: Page) {
  await page.goto(usersPath)

  await expect(
    page.getByRole('heading', {
      name: 'Users',
    })
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Invite user',
    })
  ).toBeVisible()
}

async function openUserDetails(page: Page, email: string) {
  const userRow = page
    .locator('tbody tr')
    .filter({
      hasText: email,
    })
    .first()

  await expect(userRow).toBeVisible()
  await userRow.click()
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
}

test.describe('Users Workspace', () => {
  test('admin can inspect users and edit a profile field before restoring it', async ({
    page,
  }) => {
    await gotoUsersWorkspace(page)

    await expect(page.getByText('lead@sf.acme.com', { exact: true })).toBeVisible()
    await expect(page.getByText('auditor@acme.com', { exact: true })).toBeVisible()

    await openUserDetails(page, 'lead@sf.acme.com')

    const profileForm = page.locator('#user-profile-form')
    const firstNameField = profileForm.locator('#user-detail-first-name')
    const saveButton = page.getByRole('button', { name: 'Save profile' })
    const originalFirstName = await firstNameField.inputValue()
    const updatedFirstName = `${originalFirstName || 'Lead'} QA`

    await typeIntoBaseUiField(profileForm, 'First name', updatedFirstName)
    await saveButton.click()

    await expect(firstNameField).toHaveValue(updatedFirstName)
    await expect(saveButton).toBeDisabled()

    await typeIntoBaseUiField(profileForm, 'First name', originalFirstName)
    await saveButton.click()

    await expect(firstNameField).toHaveValue(originalFirstName)
    await expect(saveButton).toBeDisabled()
  })

  test.describe('Read-only UX', () => {
    test.use({ persona: 'auditor' })

    test('auditor can inspect user detail but cannot mutate it', async ({
      page,
    }) => {
      await gotoUsersWorkspace(page)
      await openUserDetails(page, 'agent@sf.acme.com')

      await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Update status' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Reset password' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Delete user' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Assign entity' })).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'Assign direct role' })
      ).toBeDisabled()
    })
  })
})
