import type { Browser, BrowserContext, Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, buildE2eAuthApiUrl } from '../support/auth-personas'
import { selectBaseUiOption } from '../support/base-ui-select'

const apiKeysPath = '/app/api-keys'
const rootEntityName = 'ACME Realty'

type EntityListResponse = {
  items: Array<{
    id: string
    display_name: string
  }>
}

type UsersListResponse = {
  items: Array<{
    id: string
    email: string
  }>
}

type EntityMember = {
  user_id: string
  user_email: string
  roles: Array<{
    id: string
    name: string
    display_name: string
  }>
}

type PermissionRecord = {
  id: string
  name: string
}

type RoleRecord = {
  id: string
  name: string
}

let adminAccessTokenPromise: Promise<string> | null = null

async function gotoApiKeysWorkspace(page: Page) {
  await page.goto(apiKeysPath)

  await expect(page).toHaveURL(/\/app\/api-keys$/)
  await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'API Keys',
    })
  ).toBeVisible()
}

function getApiKeyRow(page: Page, keyName: string) {
  return page
    .locator('tbody tr')
    .filter({
      has: page.getByText(keyName, { exact: true }),
    })
    .first()
}

async function typeIntoApiKeyField(page: Page, selector: string, value: string) {
  const control = page.locator(selector)

  await expect(control).toBeVisible()
  await control.click()
  await control.fill(value)
  await expect(control).toHaveValue(value)
}

async function getAdminAccessToken() {
  if (!adminAccessTokenPromise) {
    adminAccessTokenPromise = (async () => {
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
    })()
  }

  return adminAccessTokenPromise
}

async function adminApiFetch(pathname: string, init: RequestInit = {}) {
  const accessToken = await getAdminAccessToken()
  const headers = new Headers(init.headers)

  headers.set('Authorization', `Bearer ${accessToken}`)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildE2eAuthApiUrl(pathname), {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new Error(`Admin API request failed (${response.status}): ${pathname}`)
  }

  return response
}

async function getEntityIdByName(entityName: string) {
  const response = await adminApiFetch(
    `/entities/?page=1&limit=100&search=${encodeURIComponent(entityName)}`
  )
  const payload = (await response.json()) as EntityListResponse
  const entity = payload.items.find((item) => item.display_name === entityName)

  if (!entity) {
    throw new Error(`Unable to find entity fixture: ${entityName}`)
  }

  return entity.id
}

async function getUserIdByEmail(email: string) {
  const response = await adminApiFetch(
    `/users/?page=1&limit=100&search=${encodeURIComponent(email)}`
  )
  const payload = (await response.json()) as UsersListResponse
  const user = payload.items.find((item) => item.email === email)

  if (!user) {
    throw new Error(`Unable to find user fixture: ${email}`)
  }

  return user.id
}

async function getEntityMember(entityId: string, email: string) {
  const response = await adminApiFetch(
    `/memberships/entity/${entityId}/details?page=1&limit=100&include_inactive=true`
  )
  const payload = (await response.json()) as EntityMember[]
  const member = payload.find((item) => item.user_email === email)

  if (!member) {
    throw new Error(`Unable to find entity member fixture: ${email}`)
  }

  return member
}

async function createPermission(permissionName: string, displayName: string) {
  const response = await adminApiFetch('/permissions/', {
    method: 'POST',
    body: JSON.stringify({
      name: permissionName,
      display_name: displayName,
      description: 'Temporary custom permission created by Playwright for API key lifecycle coverage.',
      is_system: false,
      is_active: true,
      tags: ['playwright', 'api-keys'],
      metadata: {
        created_by: 'playwright',
      },
    }),
  })

  return (await response.json()) as PermissionRecord
}

async function createRole({
  name,
  displayName,
  rootEntityId,
  permissions,
  scopeEntityId,
}: {
  name: string
  displayName: string
  rootEntityId: string
  permissions: string[]
  scopeEntityId?: string
}) {
  const response = await adminApiFetch('/roles/', {
    method: 'POST',
    body: JSON.stringify({
      name,
      display_name: displayName,
      description: 'Temporary role created by Playwright for API key lifecycle coverage.',
      permissions,
      is_global: false,
      root_entity_id: rootEntityId,
      scope_entity_id: scopeEntityId,
      scope: scopeEntityId ? 'entity_only' : 'hierarchy',
      is_auto_assigned: false,
      assignable_at_types: [],
    }),
  })

  return (await response.json()) as RoleRecord
}

async function assignDirectRoleToUser(userId: string, roleId: string) {
  await adminApiFetch(`/users/${userId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      role_id: roleId,
    }),
  })
}

async function updateRolePermissions(roleId: string, permissions: string[]) {
  await adminApiFetch(`/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      permissions,
    }),
  })
}

async function updateEntityMembershipRoles(entityId: string, userId: string, roleIds: string[]) {
  await adminApiFetch(`/memberships/${entityId}/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      role_ids: roleIds,
    }),
  })
}

async function addRoleToEntityMembership(entityId: string, email: string, roleId: string) {
  const member = await getEntityMember(entityId, email)
  const nextRoleIds = [...new Set([...member.roles.map((role) => role.id), roleId])]

  await updateEntityMembershipRoles(entityId, member.user_id, nextRoleIds)

  return member.user_id
}

async function removeRoleFromEntityMembership(entityId: string, email: string, roleId: string) {
  const member = await getEntityMember(entityId, email)
  const nextRoleIds = member.roles
    .map((role) => role.id)
    .filter((candidateRoleId) => candidateRoleId !== roleId)

  await updateEntityMembershipRoles(entityId, member.user_id, nextRoleIds)

  return member.user_id
}

async function removeDirectRoleFromUser(userId: string, roleId: string) {
  await adminApiFetch(`/users/${userId}/roles/${roleId}`, {
    method: 'DELETE',
  })
}

async function removeEntityMembership(entityId: string, userId: string) {
  await adminApiFetch(`/memberships/${entityId}/${userId}`, {
    method: 'DELETE',
  })
}

async function createTemporaryApiKeyRoleFixture({
  stem,
  rootEntityId,
  scopeEntityId,
}: {
  stem: string
  rootEntityId: string
  scopeEntityId?: string
}) {
  const scopeName = `${stem}_scope:read`
  await createPermission(scopeName, `Playwright ${stem} scope read`)

  const role = await createRole({
    name: `${stem}_role`,
    displayName: `Playwright ${stem} role`,
    rootEntityId,
    scopeEntityId,
    permissions: ['api_key:read_tree', 'api_key:create_tree', scopeName],
  })

  return {
    role,
    scopeName,
  }
}

async function createTemporaryMembershipApiKeyRoleFixture({
  stem,
  rootEntityId,
  scopeEntityId,
}: {
  stem: string
  rootEntityId: string
  scopeEntityId: string
}) {
  const scopeName = `${stem}_scope:read`
  await createPermission(scopeName, `Playwright ${stem} scope read`)

  const role = await createRole({
    name: `${stem}_scope_role`,
    displayName: `Playwright ${stem} scope role`,
    rootEntityId,
    scopeEntityId,
    permissions: ['api_key:read_tree', 'api_key:create_tree', scopeName],
  })

  return {
    role,
    scopeName,
  }
}

async function selectComboboxOption(
  page: Page,
  selector: string,
  searchValue: string,
  optionText: string
) {
  const control = page.locator(selector)

  await expect(control).toBeVisible()
  const currentValue = (await control.textContent())?.trim()
  if (currentValue === optionText) {
    return
  }
  await control.click()
  await control.fill(searchValue)
  await page
    .locator('[data-slot="combobox-content"]')
    .getByText(optionText, { exact: true })
    .first()
    .click()
}

async function createSelfOwnedApiKey(
  page: Page,
  entityName: string,
  keyName: string,
  scopeName?: string
) {
  await gotoApiKeysWorkspace(page)

  await selectComboboxOption(page, '#api-keys-entity', entityName, entityName)

  await page.getByRole('button', { name: 'Create API key' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create API key' })
  await expect(createDialog).toBeVisible()

  await typeIntoApiKeyField(page, '#api-key-name', keyName)
  await typeIntoApiKeyField(
    page,
    '#api-key-description',
    'Created by Playwright to validate API key lifecycle parity after persona scope changes.'
  )

  const scopeOption = scopeName
    ? createDialog.getByRole('checkbox', { name: scopeName })
    : createDialog
        .getByRole('checkbox', { name: /[a-z_]+:[a-z_]+/ })
        .first()

  await expect(scopeOption).toBeVisible()
  await scopeOption.click()
  await createDialog.getByRole('button', { name: 'Create API key' }).click()

  const secretDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
  await expect(secretDialog).toBeVisible()
  await secretDialog.getByRole('button', { name: 'Done' }).click()

  const createdRow = getApiKeyRow(page, keyName)
  await expect(createdRow).toBeVisible()
  await expect(createdRow.getByText('Active', { exact: true })).toBeVisible()
  await expect(createdRow.getByText('Effective', { exact: true })).toBeVisible()
}

async function createAdminInspectionPage(
  browser: Browser
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: authPersonas.admin.storageState,
  })
  const page = await context.newPage()
  return {
    context,
    page,
  }
}

async function expectKeyIneffectiveInAdminUi(
  browser: Browser,
  {
    entityName,
    keyName,
    reasonText,
    statusText = 'Active',
  }: {
    entityName: string
    keyName: string
    reasonText: string
    statusText?: string
  }
) {
  const { context, page } = await createAdminInspectionPage(browser)

  try {
    await gotoApiKeysWorkspace(page)
    await selectComboboxOption(page, '#api-keys-entity', entityName, entityName)
    await typeIntoApiKeyField(page, '#api-keys-search', keyName)

    const keyRow = getApiKeyRow(page, keyName)
    await expect(keyRow).toBeVisible()
    await expect(keyRow.getByText(statusText, { exact: true })).toBeVisible()
    await expect(keyRow.getByText('Ineffective', { exact: true })).toBeVisible()
    await keyRow.click()

    await expect(page.getByText(statusText, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Ineffective', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(reasonText, { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
}

test.describe('API Keys Workspace', () => {
  test('admin can create, update, rotate, and revoke an API key', async ({ page }) => {
    const timestamp = Date.now()
    const keyName = `Playwright API Key ${timestamp}`

    await createSelfOwnedApiKey(page, 'San Francisco Office', keyName)

    const createdRow = getApiKeyRow(page, keyName)
    await expect(createdRow).toBeVisible()
    await createdRow.click()

    await page.getByRole('button', { name: 'Edit key' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit API key' })
    await expect(editDialog).toBeVisible()
    await selectBaseUiOption({
      page,
      container: editDialog,
      fieldLabel: 'Lifecycle',
      optionName: 'Suspended',
    })
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Suspended', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Rotate key' }).click()
    const rotateConfirmDialog = page.getByRole('dialog', { name: 'Rotate API key' })
    await expect(rotateConfirmDialog).toBeVisible()
    await expect(
      rotateConfirmDialog.getByText(
        'Rotating this key creates a replacement secret and revokes the current secret immediately.'
      )
    ).toBeVisible()
    await rotateConfirmDialog.getByRole('button', { name: 'Rotate key' }).click()

    const rotateDialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(rotateDialog).toBeVisible()
    await expect(
      rotateDialog.getByText('Rotation creates a replacement key and revokes the old secret immediately.')
    ).toBeVisible()
    await rotateDialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Revoke key' }).click()

    const revokeDialog = page.getByRole('dialog', { name: 'Revoke API key' })
    await expect(revokeDialog).toBeVisible()
    await revokeDialog.getByRole('button', { name: 'Revoke key' }).click()

    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible()
  })

  test.describe('Persona Lifecycle Mutations', () => {
    test.describe('Org Admin', () => {
      test.use({ persona: 'orgAdmin' })

      test('self-owned key becomes ineffective after a granted permission is removed from the direct role', async ({
        page,
        browser,
      }) => {
        const timestamp = Date.now()
        const userId = await getUserIdByEmail(authPersonas.orgAdmin.email)
        const rootEntityId = await getEntityIdByName(rootEntityName)
        const keyName = `Org Admin Permission Loss ${timestamp}`
        const { role, scopeName } = await createTemporaryApiKeyRoleFixture({
          stem: `playwright_org_permission_${timestamp}`,
          rootEntityId,
        })

        await assignDirectRoleToUser(userId, role.id)
        await createSelfOwnedApiKey(page, rootEntityName, keyName, scopeName)

        await updateRolePermissions(role.id, ['api_key:read_tree', 'api_key:create_tree'])

        await expectKeyIneffectiveInAdminUi(browser, {
          entityName: rootEntityName,
          keyName,
          reasonText: 'No Effective Scopes',
        })
      })

      test('self-owned key becomes ineffective after the direct role is revoked from the user', async ({
        page,
        browser,
      }) => {
        const timestamp = Date.now()
        const userId = await getUserIdByEmail(authPersonas.orgAdmin.email)
        const rootEntityId = await getEntityIdByName(rootEntityName)
        const keyName = `Org Admin Role Revoked ${timestamp}`
        const { role, scopeName } = await createTemporaryApiKeyRoleFixture({
          stem: `playwright_org_role_${timestamp}`,
          rootEntityId,
        })

        await assignDirectRoleToUser(userId, role.id)
        await createSelfOwnedApiKey(page, rootEntityName, keyName, scopeName)

        await removeDirectRoleFromUser(userId, role.id)

        await expectKeyIneffectiveInAdminUi(browser, {
          entityName: rootEntityName,
          keyName,
          reasonText: 'No Effective Scopes',
        })
      })
    })

    test.describe('Regional Admin', () => {
      test.use({ persona: 'regionalAdmin' })

      test('self-owned key becomes ineffective after the membership role is removed from the entity', async ({
        page,
        browser,
      }) => {
        const timestamp = Date.now()
        const entityName = 'West Coast Region'
        const rootEntityId = await getEntityIdByName(rootEntityName)
        const entityId = await getEntityIdByName(entityName)
        const keyName = `Regional Admin Membership Role ${timestamp}`
        const { role, scopeName } = await createTemporaryMembershipApiKeyRoleFixture({
          stem: `playwright_regional_membership_${timestamp}`,
          rootEntityId,
          scopeEntityId: entityId,
        })

        await addRoleToEntityMembership(entityId, authPersonas.regionalAdmin.email, role.id)
        await createSelfOwnedApiKey(page, entityName, keyName, scopeName)

        await removeRoleFromEntityMembership(entityId, authPersonas.regionalAdmin.email, role.id)

        await expectKeyIneffectiveInAdminUi(browser, {
          entityName,
          keyName,
          reasonText: 'No Effective Scopes',
        })
      })
    })

    test.describe('Office Admin', () => {
      test.use({ persona: 'officeAdmin' })

      test('self-owned key becomes ineffective after removing the owner from the entity', async ({
        page,
        browser,
      }) => {
        const timestamp = Date.now()
        const entityName = 'San Francisco Office'
        const rootEntityId = await getEntityIdByName(rootEntityName)
        const entityId = await getEntityIdByName(entityName)
        const userId = await getUserIdByEmail(authPersonas.officeAdmin.email)
        const keyName = `Office Admin Membership Removed ${timestamp}`
        const { role, scopeName } = await createTemporaryMembershipApiKeyRoleFixture({
          stem: `playwright_office_membership_${timestamp}`,
          rootEntityId,
          scopeEntityId: entityId,
        })

        await addRoleToEntityMembership(entityId, authPersonas.officeAdmin.email, role.id)
        await createSelfOwnedApiKey(page, entityName, keyName, scopeName)

        await removeEntityMembership(entityId, userId)

        await expectKeyIneffectiveInAdminUi(browser, {
          entityName,
          keyName,
          reasonText: 'No Effective Scopes',
        })
      })
    })
  })
})
