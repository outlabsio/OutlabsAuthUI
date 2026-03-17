import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, e2eApiBaseURL } from '../support/auth-personas'
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

async function getAdminAccessToken() {
  const response = await fetch(`${e2eApiBaseURL}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: authPersonas.admin.email,
      password: authPersonas.admin.password,
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to authenticate admin test fixture: ${response.status}`)
  }

  const payload = (await response.json()) as { access_token: string }
  return payload.access_token
}

async function createTemporaryDirectRole() {
  const accessToken = await getAdminAccessToken()
  const timestamp = Date.now()
  const response = await fetch(`${e2eApiBaseURL}/v1/roles/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: `playwright_direct_role_${timestamp}`,
      display_name: `Playwright Direct Role ${timestamp}`,
      description: 'Temporary role created by Playwright to validate direct role assignment.',
      permissions: ['lead:read'],
      is_global: true,
      scope: 'hierarchy',
      is_auto_assigned: false,
      assignable_at_types: [],
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to create direct role fixture: ${response.status}`)
  }

  return (await response.json()) as { display_name: string }
}

function getDirectRoleCardByStatus(page: Page, roleName: string, status: string) {
  return page
    .locator('div.rounded-lg')
    .filter({
      has: page.getByText(roleName, { exact: true }),
      hasText: status,
    })
    .first()
}

async function removeDirectRoleIfPresent(page: Page, roleName: string) {
  const roleCard = getDirectRoleCardByStatus(page, roleName, 'Active')

  if (!(await roleCard.isVisible().catch(() => false))) {
    return
  }

  await roleCard.getByRole('button', { name: 'Remove' }).click()

  const confirmCard = getDirectRoleCardByStatus(page, roleName, 'Active')
  await confirmCard.getByRole('button', { name: 'Confirm remove' }).click()
  await expect(getDirectRoleCardByStatus(page, roleName, 'Active')).toHaveCount(0)
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

  test('admin can filter invited users and resend an invitation', async ({
    page,
  }) => {
    await gotoUsersWorkspace(page)

    await page.getByRole('combobox', { name: 'Filter by status' }).click()
    await page.getByRole('option', { name: 'Invited' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page.getByText('invited@acme.com', { exact: true })).toBeVisible()
    await expect(page.getByText('lead@sf.acme.com', { exact: true })).toHaveCount(0)

    await openUserDetails(page, 'invited@acme.com')
    const accountStatusSection = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'Account status' }),
      })
      .first()

    await accountStatusSection
      .getByRole('button', { name: 'Resend invite', exact: true })
      .click()
    await expect(page.getByText('Invitation email re-sent successfully.')).toBeVisible()
  })

  test('admin can assign and remove a direct account role', async ({ page }) => {
    const temporaryRole = await createTemporaryDirectRole()
    const roleName = temporaryRole.display_name

    await gotoUsersWorkspace(page)
    await openUserDetails(page, 'commercial@sf.acme.com')

    await page.getByRole('button', { name: 'Assign direct role' }).click()

    const dialog = page.getByRole('dialog', { name: 'Assign direct roles' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('checkbox', { name: roleName }).click()
    await dialog.getByRole('button', { name: 'Assign roles' }).click()

    await expect(dialog).toBeHidden()
    await expect(getDirectRoleCardByStatus(page, roleName, 'Active')).toBeVisible()
    await expect(
      getDirectRoleCardByStatus(page, roleName, 'Active').getByText('Global', {
        exact: true,
      })
    ).toBeVisible()

    await removeDirectRoleIfPresent(page, roleName)
    await expect(getDirectRoleCardByStatus(page, roleName, 'Revoked')).toBeVisible()
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
