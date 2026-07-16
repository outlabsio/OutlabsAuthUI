import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, buildE2eAuthApiUrl } from '../support/auth-personas'

async function gotoDashboard(page: Page) {
  await page.goto('/app/dashboard')

  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
}

async function openAccountWorkspace(page: Page) {
  const trigger = page.getByRole('button', {
    name: `Open account menu for ${authPersonas.admin.email}`,
  })

  await expect(trigger).toBeVisible()
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Account' }).click()

  await expect(page).toHaveURL(/\/app\/account$/)
  await expect(page.getByRole('button', { name: 'Open Account guide' })).toBeVisible()
}

async function openUserDetails(page: Page, email: string) {
  const userRow = page
    .locator('tbody tr')
    .filter({
      has: page.getByText(email, { exact: true }),
    })
    .first()

  await expect(userRow).toBeVisible()
  await userRow.click()
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
}

async function getAdminAccessToken() {
  const response = await fetch(buildE2eAuthApiUrl('/auth/login'), {
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

async function getRoleByName(roleName: string) {
  const accessToken = await getAdminAccessToken()
  const response = await fetch(buildE2eAuthApiUrl('/roles/?page=1&limit=100'), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Unable to load role catalog: ${response.status}`)
  }

  const payload = (await response.json()) as {
    items: Array<{ id: string; name: string; display_name: string }>
  }
  const role = payload.items.find((item) => item.name === roleName)

  if (!role) {
    throw new Error(`Unable to find role fixture: ${roleName}`)
  }

  return role
}

async function getUserByEmail(email: string) {
  const accessToken = await getAdminAccessToken()
  const response = await fetch(
    buildE2eAuthApiUrl(`/users/?page=1&limit=20&search=${encodeURIComponent(email)}`),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Unable to load invited user: ${response.status}`)
  }

  const payload = (await response.json()) as {
    items: Array<{ id: string; email: string; status: string }>
  }

  return payload.items.find((item) => item.email === email) ?? null
}

async function getActiveDirectRoleNames(userId: string) {
  const accessToken = await getAdminAccessToken()
  const response = await fetch(
    buildE2eAuthApiUrl(`/users/${userId}/role-memberships?include_inactive=true`),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Unable to load user direct role memberships: ${response.status}`)
  }

  const payload = (await response.json()) as Array<{
    status: string
    role: { name: string; display_name: string }
  }>

  return payload
    .filter((membership) => membership.status === 'active')
    .map((membership) => membership.role.name)
    .sort()
}

test.describe('Simple RBAC App Shell', () => {
  test('dashboard auto-detects SimpleRBAC and hides enterprise-only workspaces', async ({
    page,
  }) => {
    await gotoDashboard(page)

    await expect(page.getByText('SimpleRBAC', { exact: true })).toBeVisible()
    await expect(page.getByText('API keys', { exact: true })).toBeVisible()
    await expect(page.getByText('User status', { exact: true })).toBeVisible()
    await expect(page.getByText('Activity tracking', { exact: true })).toBeVisible()
    await expect(page.getByText('Invitations', { exact: true })).toBeVisible()

    await expect(page.getByText('Entity hierarchy', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Context-aware roles', { exact: true })).toHaveCount(0)
    await expect(page.getByText('ABAC', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Tree permissions', { exact: true })).toHaveCount(0)

    await expect(page.getByRole('link', { name: 'Open Account workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Users workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open API Keys workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Permissions workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Roles workspace' })).toBeVisible()

    await expect(page.getByRole('link', { name: 'Open System API Keys workspace' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open Settings workspace' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open Entities workspace' })).toHaveCount(0)

    await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'API Keys', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Permissions', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Roles', exact: true })).toBeVisible()

    await expect(page.getByRole('link', { name: 'System API Keys', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Entities', exact: true })).toHaveCount(0)

    for (const enterpriseOnlyPath of ['/app/settings', '/app/entities', '/app/users/api-keys']) {
      await page.goto(enterpriseOnlyPath)
      await expect(page).toHaveURL(/\/app\/dashboard$/)
      await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
    }
  })

  test('shared workspaces stay readable against the SimpleRBAC backend contract', async ({
    page,
  }) => {
    await gotoDashboard(page)

    await openAccountWorkspace(page)
    await expect(page.locator('#account-email')).toHaveValue(authPersonas.admin.email)

    await page.goto('/app/api-keys')
    await expect(page).toHaveURL(/\/app\/api-keys$/)
    await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'API Keys', exact: true })
    ).toBeVisible()
    await expect(
      page.getByText(
        'SimpleRBAC exposes one admin-managed machine-credential model: platform-global service accounts with owned API keys.'
      )
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Users guide' })).toBeVisible()
    await expect(page.getByText(authPersonas.admin.email, { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite user' })).toBeVisible()
    await openUserDetails(page, 'editor@test.com')
    await page.getByRole('tab', { name: 'Memberships and access' }).click()
    await expect(page.getByText('Entity memberships unavailable')).toBeVisible()
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByText('Audit timeline', { exact: true })).toBeVisible()
    await expect(page.getByText('Membership history unavailable')).toBeVisible()

    await page.goto('/app/roles')
    await expect(page).toHaveURL(/\/app\/roles(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Roles guide' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByText('Administrator', { exact: true })).toBeVisible()

    await page.goto('/app/permissions')
    await expect(page).toHaveURL(/\/app\/permissions(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Permissions guide' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search permissions' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Toggle Permission permission group' })
    ).toBeVisible()
  })

  test('invite assigns selected roles as direct account roles in SimpleRBAC', async ({
    page,
  }) => {
    const writerRole = await getRoleByName('writer')
    const invitedEmail = `playwright-simple-invite-${Date.now()}@example.com`
    const invitePayloads: Array<Record<string, unknown>> = []

    await page.route('**/v1/auth/invite', async (route) => {
      invitePayloads.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/app\/users(?:\?.*)?$/)
    await page.getByRole('button', { name: 'Invite user' }).click()

    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Entity scope', { exact: true })).toHaveCount(0)
    await expect(dialog.locator('#invite-entity')).toHaveCount(0)

    await dialog.locator('#invite-email').fill(invitedEmail)
    await dialog.locator('#invite-first-name').fill('Simple')
    await dialog.locator('#invite-last-name').fill('Invite')
    await dialog.getByRole('checkbox', { name: 'Writer' }).click()
    await expect(dialog.getByText('1 selected', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog).toHaveCount(0)

    expect(invitePayloads).toHaveLength(1)
    expect(invitePayloads[0]).toMatchObject({
      email: invitedEmail,
      first_name: 'Simple',
      last_name: 'Invite',
      role_ids: [writerRole.id],
    })
    expect(invitePayloads[0]).not.toHaveProperty('entity_id')

    await expect
      .poll(async () => Boolean(await getUserByEmail(invitedEmail)))
      .toBe(true)

    const invitedUser = await getUserByEmail(invitedEmail)
    expect(invitedUser).not.toBeNull()
    expect(invitedUser?.status).toBe('invited')

    await expect
      .poll(async () =>
        invitedUser ? (await getActiveDirectRoleNames(invitedUser.id)).join(',') : ''
      )
      .toBe('writer')
  })
})
