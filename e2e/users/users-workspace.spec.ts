import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, e2eApiBaseURL } from '../support/auth-personas'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const usersPath = '/app/users'

async function gotoUsersWorkspace(page: Page) {
  await page.goto(usersPath)

  await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open Users guide' })).toBeVisible()
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

async function openUserAccessTab(page: Page) {
  await page.getByRole('tab', { name: 'Memberships and access' }).click()
  await expect(page.getByRole('heading', { name: 'Entity memberships' })).toBeVisible()
}

async function openUserHistoryTab(page: Page) {
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'Audit timeline' })).toBeVisible()
}

async function openUserMainDetailsTab(page: Page) {
  await page.getByRole('tab', { name: 'Main details' }).click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
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

async function createTemporaryUserWithMembership() {
  const accessToken = await getAdminAccessToken()
  const timestamp = Date.now()
  const email = `playwright-retained-user-${timestamp}@example.com`

  const createUserResponse = await fetch(`${e2eApiBaseURL}/v1/users/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      email,
      password: 'PlaywrightPass123!',
      first_name: 'Playwright',
      last_name: 'Retained',
    }),
  })

  if (!createUserResponse.ok) {
    throw new Error(`Unable to create temporary user fixture: ${createUserResponse.status}`)
  }

  const user = (await createUserResponse.json()) as { id: string; email: string }

  const entitiesResponse = await fetch(
    `${e2eApiBaseURL}/v1/entities/?page=1&limit=200&search=SF%20Residential%20Team`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!entitiesResponse.ok) {
    throw new Error(`Unable to load entity fixture data: ${entitiesResponse.status}`)
  }

  const entitiesPayload = (await entitiesResponse.json()) as {
    items: Array<{ id: string; display_name: string }>
  }
  const teamEntity = entitiesPayload.items.find(
    (entity) => entity.display_name === 'SF Residential Team'
  )

  if (!teamEntity) {
    throw new Error('Unable to find the SF Residential Team fixture entity.')
  }

  const membershipResponse = await fetch(`${e2eApiBaseURL}/v1/memberships/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      entity_id: teamEntity.id,
      user_id: user.id,
      role_ids: [],
    }),
  })

  if (!membershipResponse.ok) {
    throw new Error(
      `Unable to create temporary membership fixture: ${membershipResponse.status}`
    )
  }

  return user
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
    await expect(page.getByText('Invitation email re-sent.')).toBeVisible()
  })

  test('admin sees an error toast when inviting an existing user', async ({
    page,
  }) => {
    await gotoUsersWorkspace(page)

    await page.getByRole('button', { name: 'Invite user' }).click()

    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog).toBeVisible()

    await dialog.locator('#invite-email').fill('invited@acme.com')
    await dialog.getByRole('button', { name: 'Send invite' }).click()

    await expect(dialog).toBeVisible()
    await expect(
      page
        .getByLabel('Notifications alt+T')
        .getByText('User with email invited@acme.com already exists')
    ).toBeVisible()
    await expect(
      dialog.getByText('User with email invited@acme.com already exists')
    ).toBeVisible()
  })

  test('admin can assign and remove a direct account role', async ({ page }) => {
    const temporaryRole = await createTemporaryDirectRole()
    const roleName = temporaryRole.display_name

    await gotoUsersWorkspace(page)
    await openUserDetails(page, 'commercial@sf.acme.com')
    await openUserAccessTab(page)

    await page.getByRole('button', { name: 'Assign direct role' }).click()

    const dialog = page.getByRole('dialog', { name: 'Assign direct roles' })
    await expect(dialog).toBeVisible()

    const roleLabel = dialog.getByText(roleName, { exact: true }).first()
    await expect(roleLabel).toBeVisible()
    await roleLabel.click()
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

  test('admin can retained-delete a user, review lifecycle history, and restore identity-only', async ({
    page,
  }) => {
    const temporaryUser = await createTemporaryUserWithMembership()

    await gotoUsersWorkspace(page)

    await page.getByPlaceholder('Search people by name or email').fill(temporaryUser.email)
    await page.getByRole('button', { name: 'Apply' }).click()
    await openUserDetails(page, temporaryUser.email)

    await page.getByRole('button', { name: 'Delete user' }).click()

    const deleteDialog = page.getByRole('dialog', { name: 'Delete user' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.locator('#delete-user-confirm-email').fill(temporaryUser.email)
    await deleteDialog.getByRole('button', { name: 'Delete user' }).click()
    await expect(deleteDialog).toBeHidden()

    await expect(page.getByText('Deleted', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restore user' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Update status' })).toHaveCount(0)

    await openUserAccessTab(page)

    const membershipsSection = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'Entity memberships' }),
      })
      .first()
    const revokedMembershipCard = membershipsSection
      .locator('div.rounded-lg.border')
      .filter({
        has: page.getByText('SF Residential Team', { exact: true }),
      })
      .first()
    await expect(revokedMembershipCard).toBeVisible()
    await expect(
      revokedMembershipCard.getByText('Revoked', { exact: true })
    ).toBeVisible()
    await expect(
      revokedMembershipCard.getByRole('button', { name: 'Restore access' })
    ).toBeVisible()

    await openUserHistoryTab(page)

    const auditSection = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'Audit timeline' }),
      })
      .first()
    const deletedAuditEvent = auditSection
      .locator('div.rounded-lg.border')
      .filter({
        has: page.locator('div.font-medium').getByText('Deleted', {
          exact: true,
        }),
      })
      .first()
    await expect(deletedAuditEvent).toBeVisible()

    const membershipHistorySection = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'Membership history' }),
      })
      .first()
    const revokedHistoryEvent = membershipHistorySection
      .locator('div.rounded-lg.border')
      .filter({
        has: page.getByText('SF Residential Team', { exact: true }),
        hasText: 'Revoked',
      })
      .first()
    await expect(revokedHistoryEvent).toBeVisible()

    await openUserMainDetailsTab(page)
    await page.getByRole('button', { name: 'Restore user' }).click()
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()

    await openUserHistoryTab(page)
    const restoredAuditEvent = auditSection
      .locator('div.rounded-lg.border')
      .filter({
        has: page.locator('div.font-medium').getByText('Restored', {
          exact: true,
        }),
      })
      .first()
    await expect(restoredAuditEvent).toBeVisible()

    await openUserAccessTab(page)
    await expect(
      revokedMembershipCard.getByRole('button', { name: 'Restore access' })
    ).toBeVisible()
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

      await openUserAccessTab(page)
      await expect(page.getByRole('button', { name: 'Assign entity' })).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'Assign direct role' })
      ).toBeDisabled()
    })
  })
})
