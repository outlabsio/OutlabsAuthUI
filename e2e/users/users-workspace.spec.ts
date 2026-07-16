import type { Locator, Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, e2eApiBaseURL } from '../support/auth-personas'
import { typeIntoBaseUiField } from '../support/base-ui-text'

const usersPath = '/app/users'

async function gotoUsersWorkspace(page: Page) {
  await page.goto(usersPath)

  await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open Users guide' })).toBeVisible()
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

async function expectUsersSearchParam(page: Page, searchValue: string) {
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(searchValue)
}

async function expectUsersStatusParam(page: Page, statusValue: string) {
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe(statusValue)
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

  return (await response.json()) as { id: string; display_name: string }
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
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString()
}

async function setDialogDateTime({
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

async function getPersonaAccessToken(email: string, password: string) {
  const response = await fetch(`${e2eApiBaseURL}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(`Unable to authenticate persona ${email}: ${response.status}`)
  }

  const payload = (await response.json()) as { access_token: string }
  return payload.access_token
}

async function createPersonalApiKeyForPersona(email: string, password: string, name: string) {
  const accessToken = await getPersonaAccessToken(email, password)
  const response = await fetch(`${e2eApiBaseURL}/v1/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name,
      scopes: ['lead:read'],
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to create personal API key fixture: ${response.status}`)
  }

  return (await response.json()) as { id: string; name: string }
}

async function createTemporaryUser(label = 'superuser-target') {
  const accessToken = await getAdminAccessToken()
  const timestamp = Date.now()
  const email = `playwright-${label}-${timestamp}@example.com`

  const response = await fetch(`${e2eApiBaseURL}/v1/users/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      email,
      password: 'PlaywrightPass123!',
      first_name: 'Playwright',
      last_name: 'Superuser',
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to create temporary user fixture: ${response.status}`)
  }

  return (await response.json()) as { id: string; email: string }
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

async function updateSuperuserViaApi(userId: string, isSuperuser: boolean) {
  const accessToken = await getAdminAccessToken()
  const response = await fetch(`${e2eApiBaseURL}/v1/users/${userId}/superuser`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      is_superuser: isSuperuser,
      reason: 'Playwright cleanup',
    }),
  })

  if (response.status === 404) {
    return
  }

  if (!response.ok) {
    throw new Error(`Unable to update superuser fixture: ${response.status}`)
  }
}

async function restoreUserProfile({
  userId,
  firstName,
  lastName,
}: {
  userId: string
  firstName: string
  lastName?: string
}) {
  const accessToken = await getAdminAccessToken()
  const response = await fetch(`${e2eApiBaseURL}/v1/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to restore user profile fixture: ${response.status}`)
  }
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

function getSuperuserAccessSection(page: Page) {
  return page
    .locator('[data-slot="card"]')
    .filter({
      has: page.getByRole('heading', { name: 'Superuser access' }),
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
    await expect(page.getByRole('button', { name: 'Invite user' })).toBeVisible()

    await expect(page.getByText('lead@sf.acme.com', { exact: true })).toBeVisible()
    await expect(page.getByText('auditor@acme.com', { exact: true })).toBeVisible()

    await openUserDetails(page, 'lead@sf.acme.com')

    const profileForm = page.locator('#user-profile-form')
    const firstNameField = profileForm.locator('#user-detail-first-name')
    const lastNameField = profileForm.locator('#user-detail-last-name')
    const saveButton = page.getByRole('button', { name: 'Save profile' })
    const originalFirstName = await firstNameField.inputValue()
    const originalLastName = await lastNameField.inputValue()
    const updatedFirstName = `${originalFirstName || 'Lead'} QA`
    const userId = page.url().split('/app/users/')[1]?.split('?')[0]

    if (!userId) {
      throw new Error('Unable to resolve the selected user id from the URL.')
    }

    try {
      await typeIntoBaseUiField(profileForm, 'First name', updatedFirstName)
      await saveButton.click()

      await expect(firstNameField).toHaveValue(updatedFirstName)
      await expect(saveButton).toBeDisabled()
    } finally {
      await restoreUserProfile({
        userId,
        firstName: originalFirstName,
        lastName: originalLastName,
      })
    }

    await page.reload()
    await expect(firstNameField).toHaveValue(originalFirstName)
    await expect(saveButton).toBeDisabled()
  })

  test('admin can filter invited users and resend an invitation', async ({
    page,
  }) => {
    await gotoUsersWorkspace(page)

    await page.getByRole('combobox', { name: 'Filter by status' }).click()
    await page.getByRole('option', { name: 'Invited' }).click()
    await expectUsersStatusParam(page, 'invited')

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

  test('admin can create a user with a password and land on user details', async ({
    page,
  }) => {
    const timestamp = Date.now()
    const email = `playwright-create-user-${timestamp}@example.com`
    const password = 'Testpass1!'

    await gotoUsersWorkspace(page)
    await expect(page.getByRole('button', { name: 'Create user' })).toBeVisible()
    await page.getByRole('button', { name: 'Create user' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create user' })
    await expect(dialog).toBeVisible()

    await dialog.locator('#create-user-email').fill(email)
    await dialog.locator('#create-user-first-name').fill('Playwright')
    await dialog.locator('#create-user-last-name').fill('Created')
    await dialog.locator('#create-user-password').fill(password)
    await dialog.locator('#create-user-confirm-password').fill(password)
    await dialog.getByRole('button', { name: 'Create user', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/app\/users\/[^/?]+/)
    await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Playwright Created').first()).toBeVisible()
  })

  test('admin can invite a user with superuser access', async ({ page }) => {
    const email = `playwright-super-invite-${Date.now()}@example.com`
    let invitedUserId: string | null = null

    try {
      await gotoUsersWorkspace(page)
      await page.getByRole('button', { name: 'Invite user' }).click()

      const dialog = page.getByRole('dialog', { name: 'Invite user' })
      await expect(dialog).toBeVisible()

      await dialog.locator('#invite-email').fill(email)
      await dialog.locator('[data-slot="switch"]').click()
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await expect(dialog).toBeHidden()

      await page.getByPlaceholder('Search people by name or email').fill(email)
      await expectUsersSearchParam(page, email)
      await openUserDetails(page, email)

      invitedUserId = page.url().split('/app/users/')[1]?.split('?')[0] ?? null
      await expect(
        getSuperuserAccessSection(page).getByText('Superuser', { exact: true })
      ).toBeVisible()
      await expect(
        getSuperuserAccessSection(page).getByRole('button', {
          name: 'Remove superuser',
        })
      ).toBeVisible()
    } finally {
      if (invitedUserId) {
        await updateSuperuserViaApi(invitedUserId, false)
      }
    }
  })

  test('admin can grant and revoke superuser access from user details', async ({
    page,
  }) => {
    const temporaryUser = await createTemporaryUser()

    try {
      await gotoUsersWorkspace(page)
      await page.getByPlaceholder('Search people by name or email').fill(temporaryUser.email)
      await expectUsersSearchParam(page, temporaryUser.email)
      await openUserDetails(page, temporaryUser.email)

      const superuserSection = getSuperuserAccessSection(page)
      await expect(
        superuserSection.getByText('Standard user', { exact: true })
      ).toBeVisible()

      await superuserSection.getByRole('button', { name: 'Grant superuser' }).click()
      const grantDialog = page.getByRole('dialog', {
        name: 'Grant superuser access',
      })
      await expect(grantDialog).toBeVisible()
      await grantDialog.getByRole('button', { name: 'Grant superuser' }).click()
      await expect(grantDialog).toBeHidden()
      await expect(
        superuserSection.getByText('Superuser', { exact: true })
      ).toBeVisible()

      await superuserSection.getByRole('button', { name: 'Remove superuser' }).click()
      const revokeDialog = page.getByRole('dialog', {
        name: 'Remove superuser access',
      })
      await expect(revokeDialog).toBeVisible()
      await revokeDialog.getByRole('button', { name: 'Remove superuser' }).click()
      await expect(revokeDialog).toBeHidden()
      await expect(
        superuserSection.getByText('Standard user', { exact: true })
      ).toBeVisible()
    } finally {
      await updateSuperuserViaApi(temporaryUser.id, false)
    }
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

  test('admin can edit a direct role membership validity window', async ({ page }) => {
    const temporaryRole = await createTemporaryDirectRole()
    const roleName = temporaryRole.display_name
    const windowEnd = new Date()
    windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 2)
    const endYear = windowEnd.getUTCFullYear()
    const endMonth = windowEnd.getUTCMonth() + 1
    const endDay = Math.min(15, windowEnd.getUTCDate())

    await gotoUsersWorkspace(page)
    await openUserDetails(page, 'commercial@sf.acme.com')
    await openUserAccessTab(page)

    await page.getByRole('button', { name: 'Assign direct role' }).click()
    const assignDialog = page.getByRole('dialog', { name: 'Assign direct roles' })
    await expect(assignDialog).toBeVisible()
    await assignDialog.getByText(roleName, { exact: true }).first().click()
    await assignDialog.getByRole('button', { name: 'Assign roles' }).click()
    await expect(assignDialog).toBeHidden()

    const roleCard = getDirectRoleCardByStatus(page, roleName, 'Active')
    await expect(roleCard).toBeVisible()
    await expect(roleCard.getByText('Always on', { exact: true })).toBeVisible()

    await roleCard.getByRole('button', { name: 'Edit window' }).click()
    const editDialog = page.getByRole('dialog', { name: /Edit role window/ })
    await expect(editDialog).toBeVisible()

    await setDialogDateTime({
      dialog: editDialog,
      page,
      buttonId: 'edit-direct-role-valid-until',
      year: endYear,
      month: endMonth,
      day: endDay,
      timeLabel: '12:00 PM',
    })
    await editDialog.getByRole('button', { name: 'Save window' }).click()
    await expect(editDialog).toBeHidden()

    await expect(roleCard.getByText('Always on', { exact: true })).toHaveCount(0)
    await expect(roleCard.getByText('Open ended', { exact: true })).toHaveCount(0)
    await expect(roleCard.getByText(/->/)).toBeVisible()

    await removeDirectRoleIfPresent(page, roleName)
  })

  test('admin can revoke another user’s personal API key from user details', async ({
    page,
  }) => {
    const keyName = `Playwright User Key ${Date.now()}`
    await createPersonalApiKeyForPersona(
      authPersonas.commercialAgent.email,
      authPersonas.commercialAgent.password,
      keyName
    )

    await gotoUsersWorkspace(page)
    await openUserDetails(page, authPersonas.commercialAgent.email)
    await openUserAccessTab(page)

    const apiKeysSection = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'Personal API keys' }),
      })
      .first()
    await expect(apiKeysSection.getByRole('heading', { name: 'Personal API keys' })).toBeVisible()

    const keyCard = apiKeysSection
      .locator('div.rounded-lg.border')
      .filter({
        has: page.getByText(keyName, { exact: true }),
      })
      .first()
    await expect(keyCard).toBeVisible()
    await expect(keyCard.getByText('Active', { exact: true })).toBeVisible()

    await keyCard.getByRole('button', { name: 'Revoke' }).click()
    await keyCard.getByRole('button', { name: 'Confirm revoke' }).click()

    await expect(keyCard.getByText('Revoked', { exact: true })).toBeVisible()
    await expect(keyCard.getByRole('button', { name: 'Revoke' })).toHaveCount(0)
  })

  test('admin can retained-delete a user, review lifecycle history, and restore identity-only', async ({
    page,
  }) => {
    const temporaryUser = await createTemporaryUserWithMembership()

    await gotoUsersWorkspace(page)

    await page.getByPlaceholder('Search people by name or email').fill(temporaryUser.email)
    await expectUsersSearchParam(page, temporaryUser.email)
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
      await expect(page.getByRole('button', { name: 'Grant superuser' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Reset password' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Delete user' })).toBeDisabled()

      await openUserAccessTab(page)
      await expect(page.getByRole('button', { name: 'Assign entity' })).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'Assign direct role' })
      ).toBeDisabled()
    })
  })

  test.describe('Operational UX', () => {
    test.use({ persona: 'teamLead' })

    test('team lead can inspect users but cannot invite or mutate them', async ({
      page,
    }) => {
      await gotoUsersWorkspace(page)

      await expect(page.getByRole('button', { name: 'Invite user' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create user' })).toHaveCount(0)

      await openUserDetails(page, 'agent@sf.acme.com')

      await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Update status' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Grant superuser' })).toBeDisabled()
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
