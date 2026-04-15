import type { Page, APIResponse } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { authPersonas, buildE2eAuthApiUrl } from '../support/auth-personas'

type EntityListItem = {
  id: string
  display_name: string
}

type EntityListResponse = {
  items: EntityListItem[]
}

type IntegrationPrincipalResponse = {
  id: string
  scope_kind: 'entity' | 'platform_global'
  anchor_entity_id: string | null
  inherit_from_tree: boolean
  allowed_scopes: string[]
  status: string
}

type CreateApiKeyResponse = {
  id: string
  api_key: string
  key_kind: 'personal' | 'system_integration'
  owner_type: 'user' | 'integration_principal'
  owner_id: string
  status: string
}

type ApiKeysInventoryResponse = {
  items: Array<{
    id: string
    name: string
    key_kind: string
    owner_type: string
    status: string
  }>
}

type GrantableScopesResponse = {
  grantable_scopes: string[]
}

let fixtureEntityIdsPromise: Promise<Record<string, string>> | null = null

async function gotoApiKeysWorkspace(page: Page) {
  await page.goto('/app/users/api-keys')

  await expect(page).toHaveURL(/\/app\/users\/api-keys(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open System API Keys guide' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'System API Keys' })).toBeVisible()
}

async function getAccessToken(page: Page) {
  const accessToken = await page.evaluate(() =>
    window.localStorage.getItem('outlabs-auth.access-token')
  )

  if (!accessToken) {
    throw new Error('Expected auth access token in localStorage.')
  }

  return accessToken
}

async function loginWithCredentials(email: string, password: string) {
  const response = await fetch(buildE2eAuthApiUrl('/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to authenticate ${email}: ${response.status}`)
  }

  return (await response.json()) as { access_token: string }
}

async function getFixtureEntityIds() {
  if (!fixtureEntityIdsPromise) {
    fixtureEntityIdsPromise = (async () => {
      const login = await loginWithCredentials(
        authPersonas.admin.email,
        authPersonas.admin.password
      )
      const response = await fetch(buildE2eAuthApiUrl('/entities/?page=1&limit=200'), {
        headers: {
          Authorization: `Bearer ${login.access_token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Unable to load fixture entities: ${response.status}`)
      }

      const payload = (await response.json()) as EntityListResponse
      const entityIds = new Map(payload.items.map((item) => [item.display_name, item.id]))
      const requiredEntities = [
        'ACME Realty',
        'West Coast Region',
        'East Coast Region',
        'San Francisco Office',
        'SF Residential Team',
        'New York City Office',
      ]

      for (const entityName of requiredEntities) {
        if (!entityIds.has(entityName)) {
          throw new Error(`Missing fixture entity ${entityName}`)
        }
      }

      return Object.fromEntries(requiredEntities.map((name) => [name, entityIds.get(name)!]))
    })()
  }

  return fixtureEntityIdsPromise
}

async function getPermissionNames(page: Page, accessToken: string) {
  const response = await page.request.get(buildE2eAuthApiUrl('/permissions/me'), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  expect(response.ok()).toBeTruthy()
  const payload = (await response.json()) as string[]
  return payload.sort()
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  if (response.status() !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${response.status()}: ${await response.text()}`)
  }

  return response.json()
}

async function createEntityIntegrationPrincipal(
  page: Page,
  accessToken: string,
  entityId: string,
  {
    name,
    allowedScopes,
    inheritFromTree,
  }: {
    name: string
    allowedScopes: string[]
    inheritFromTree: boolean
  }
) {
  const response = await page.request.post(
    buildE2eAuthApiUrl(`/admin/entities/${entityId}/integration-principals`),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        name,
        description: `${name} created by Playwright persona access tests.`,
        allowed_scopes: allowedScopes,
        inherit_from_tree: inheritFromTree,
      },
    }
  )

  return {
    response,
    payload: (await response.json().catch(() => null)) as IntegrationPrincipalResponse | null,
  }
}

async function createPlatformGlobalIntegrationPrincipal(
  page: Page,
  accessToken: string,
  {
    name,
    allowedScopes,
  }: {
    name: string
    allowedScopes: string[]
  }
) {
  const response = await page.request.post(
    buildE2eAuthApiUrl('/admin/system/integration-principals'),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        name,
        description: `${name} created by Playwright persona access tests.`,
        allowed_scopes: allowedScopes,
      },
    }
  )

  return {
    response,
    payload: (await response.json().catch(() => null)) as IntegrationPrincipalResponse | null,
  }
}

async function createSystemIntegrationKey(
  page: Page,
  accessToken: string,
  {
    scopeKind,
    entityId,
    principalId,
    name,
    scopes,
  }: {
    scopeKind: 'entity' | 'platform_global'
    entityId?: string
    principalId: string
    name: string
    scopes: string[]
  }
) {
  const path =
    scopeKind === 'entity'
      ? `/admin/entities/${entityId}/integration-principals/${principalId}/api-keys`
      : `/admin/system/integration-principals/${principalId}/api-keys`

  const response = await page.request.post(buildE2eAuthApiUrl(path), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      name,
      description: `${name} created by Playwright persona access tests.`,
      scopes,
      prefix_type: 'sk_live',
    },
  })

  return {
    response,
    payload: (await response.json().catch(() => null)) as CreateApiKeyResponse | null,
  }
}

async function revokeSystemIntegrationKey(
  page: Page,
  accessToken: string,
  {
    scopeKind,
    entityId,
    principalId,
    keyId,
  }: {
    scopeKind: 'entity' | 'platform_global'
    entityId?: string
    principalId: string
    keyId: string
  }
) {
  const path =
    scopeKind === 'entity'
      ? `/admin/entities/${entityId}/integration-principals/${principalId}/api-keys/${keyId}`
      : `/admin/system/integration-principals/${principalId}/api-keys/${keyId}`

  return page.request.delete(buildE2eAuthApiUrl(path), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

async function getEntityInventory(
  page: Page,
  accessToken: string,
  entityId: string,
  search: string
) {
  const response = await page.request.get(
    buildE2eAuthApiUrl(
      `/admin/entities/${entityId}/api-keys?search=${encodeURIComponent(search)}`
    ),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  expect(response.ok()).toBeTruthy()
  return (await response.json()) as ApiKeysInventoryResponse
}

async function expectTeamDirectoryStatus(
  page: Page,
  apiKey: string,
  entityId: string,
  expectedStatuses: number[]
) {
  const response = await page.request.get(
    buildE2eAuthApiUrl(`/entities/${entityId}/team-directory`),
    {
      headers: {
        'X-API-Key': apiKey,
      },
    }
  )

  expect(expectedStatuses).toContain(response.status())
  return response
}

test.describe('API Key Persona Access Matrix', () => {
  test.describe('self-service personal keys', () => {
    test.use({ persona: 'agent' })

    test('agent can create, rotate, list, and revoke a personal API key through the self-service surface', async ({
      page,
    }) => {
      const timestamp = Date.now()

      await page.goto('/app/api-keys')
      await expect(page).toHaveURL(/\/app\/api-keys$/)
      await expect(page.getByRole('button', { name: 'Open API Keys guide' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create API key' })).toBeVisible()

      const accessToken = await getAccessToken(page)

      const grantableScopesResponse = await page.request.get(
        buildE2eAuthApiUrl('/api-keys/grantable-scopes'),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      const grantableScopes = (await expectJsonStatus(
        grantableScopesResponse,
        200
      )) as GrantableScopesResponse

      expect(grantableScopes.grantable_scopes.length).toBeGreaterThan(0)

      const createResponse = await page.request.post(buildE2eAuthApiUrl('/api-keys'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          name: `Playwright Agent Personal Key ${timestamp}`,
          description: 'Created by Playwright to validate the personal API key self-service flow.',
          scopes: [grantableScopes.grantable_scopes[0]],
          key_kind: 'personal',
          prefix_type: 'sk_live',
        },
      })
      const createdKey = (await expectJsonStatus(createResponse, 201)) as CreateApiKeyResponse

      expect(createdKey.key_kind).toBe('personal')
      expect(createdKey.owner_type).toBe('user')
      expect(createdKey.api_key).toMatch(/^sk_live_/)

      const listResponse = await page.request.get(buildE2eAuthApiUrl('/api-keys'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const listedKeys = (await expectJsonStatus(listResponse, 200)) as Array<{ id: string }>
      expect(listedKeys.some((apiKey) => apiKey.id === createdKey.id)).toBeTruthy()

      const rotateResponse = await page.request.post(
        buildE2eAuthApiUrl(`/api-keys/${createdKey.id}/rotate`),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      const rotatedKey = (await expectJsonStatus(rotateResponse, 200)) as CreateApiKeyResponse

      expect(rotatedKey.id).not.toBe(createdKey.id)
      expect(rotatedKey.key_kind).toBe('personal')

      const revokeResponse = await page.request.delete(
        buildE2eAuthApiUrl(`/api-keys/${rotatedKey.id}`),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      expect(revokeResponse.status()).toBe(204)

      const finalListResponse = await page.request.get(buildE2eAuthApiUrl('/api-keys'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const finalList = (await expectJsonStatus(finalListResponse, 200)) as Array<{
        id: string
        status: string
      }>
      expect(
        finalList.some((apiKey) => apiKey.id === rotatedKey.id && apiKey.status === 'revoked')
      ).toBeTruthy()
    })
  })

  test.describe('root-scoped admins', () => {
    test.use({ persona: 'orgAdmin' })

    test('org admin can create, use, inventory, and revoke a root-scoped system integration key', async ({
      page,
    }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()
      await expect(page.getByText('Insufficient permissions')).toHaveCount(0)

      const accessToken = await getAccessToken(page)
      const permissionNames = await getPermissionNames(page, accessToken)
      expect(permissionNames).toEqual(
        expect.arrayContaining([
          'api_key:create_tree',
          'api_key:read_tree',
          'api_key:update_tree',
          'api_key:delete_tree',
          'membership:read_tree',
        ])
      )

      const principalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['ACME Realty'],
        {
          name: `Playwright Org Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
          inheritFromTree: true,
        }
      )
      const principal = (await expectJsonStatus(
        principalResult.response,
        201
      )) as IntegrationPrincipalResponse

      expect(principal.scope_kind).toBe('entity')
      expect(principal.anchor_entity_id).toBe(entityIds['ACME Realty'])

      const keyResult = await createSystemIntegrationKey(page, accessToken, {
        scopeKind: 'entity',
        entityId: entityIds['ACME Realty'],
        principalId: principal.id,
        name: `Playwright Org Key ${timestamp}`,
        scopes: ['membership:read_tree'],
      })
      const key = (await expectJsonStatus(keyResult.response, 201)) as CreateApiKeyResponse

      expect(key.key_kind).toBe('system_integration')
      expect(key.owner_type).toBe('integration_principal')

      const teamDirectory = await expectTeamDirectoryStatus(
        page,
        key.api_key,
        entityIds['SF Residential Team'],
        [200]
      )
      expect(teamDirectory.ok()).toBeTruthy()

      const inventory = await getEntityInventory(
        page,
        accessToken,
        entityIds['ACME Realty'],
        `Playwright Org Key ${timestamp}`
      )
      expect(inventory.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: key.id,
            owner_type: 'integration_principal',
            key_kind: 'system_integration',
          }),
        ])
      )

      const revokeResponse = await page.request.delete(
        buildE2eAuthApiUrl(`/admin/entities/${entityIds['ACME Realty']}/api-keys/${key.id}`),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      expect(revokeResponse.status()).toBe(204)

      await expectTeamDirectoryStatus(page, key.api_key, entityIds['SF Residential Team'], [
        401,
        403,
      ])
    })
  })

  test.describe('hierarchy admins', () => {
    test.use({ persona: 'regionalAdmin' })

    test('regional admin can create West Coast integrations but not cross into East Coast', async ({
      page,
    }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()

      const accessToken = await getAccessToken(page)
      const permissionNames = await getPermissionNames(page, accessToken)
      expect(permissionNames).toEqual(
        expect.arrayContaining([
          'api_key:create_tree',
          'api_key:read_tree',
          'membership:read_tree',
        ])
      )

      const allowedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['West Coast Region'],
        {
          name: `Playwright West Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
          inheritFromTree: true,
        }
      )
      const allowedPrincipal = (await expectJsonStatus(
        allowedPrincipalResult.response,
        201
      )) as IntegrationPrincipalResponse

      const deniedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['East Coast Region'],
        {
          name: `Playwright East Denied Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
          inheritFromTree: true,
        }
      )
      expect(deniedPrincipalResult.response.status()).toBe(403)

      const keyResult = await createSystemIntegrationKey(page, accessToken, {
        scopeKind: 'entity',
        entityId: entityIds['West Coast Region'],
        principalId: allowedPrincipal.id,
        name: `Playwright West Key ${timestamp}`,
        scopes: ['membership:read_tree'],
      })
      const key = (await expectJsonStatus(keyResult.response, 201)) as CreateApiKeyResponse

      await expectTeamDirectoryStatus(page, key.api_key, entityIds['SF Residential Team'], [200])
      await expectTeamDirectoryStatus(page, key.api_key, entityIds['New York City Office'], [
        401,
        403,
      ])
    })
  })

  test.describe('entity-only admins', () => {
    test.use({ persona: 'officeAdmin' })

    test('office admin can create office-local keys but cannot escalate to branch or platform-global', async ({
      page,
    }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()

      const accessToken = await getAccessToken(page)
      const permissionNames = await getPermissionNames(page, accessToken)
      expect(permissionNames).toEqual(
        expect.arrayContaining(['api_key:create', 'api_key:read', 'membership:read'])
      )
      expect(permissionNames).not.toEqual(expect.arrayContaining(['api_key:create_tree']))

      const allowedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['San Francisco Office'],
        {
          name: `Playwright Office Principal ${timestamp}`,
          allowedScopes: ['membership:read'],
          inheritFromTree: false,
        }
      )
      const allowedPrincipal = (await expectJsonStatus(
        allowedPrincipalResult.response,
        201
      )) as IntegrationPrincipalResponse

      const deniedBranchPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['West Coast Region'],
        {
          name: `Playwright Office Denied Branch Principal ${timestamp}`,
          allowedScopes: ['membership:read'],
          inheritFromTree: false,
        }
      )
      expect(deniedBranchPrincipalResult.response.status()).toBe(403)

      const deniedPlatformPrincipalResult = await createPlatformGlobalIntegrationPrincipal(
        page,
        accessToken,
        {
          name: `Playwright Office Denied Global Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
        }
      )
      expect(deniedPlatformPrincipalResult.response.status()).toBe(403)

      const keyResult = await createSystemIntegrationKey(page, accessToken, {
        scopeKind: 'entity',
        entityId: entityIds['San Francisco Office'],
        principalId: allowedPrincipal.id,
        name: `Playwright Office Key ${timestamp}`,
        scopes: ['membership:read'],
      })
      const key = (await expectJsonStatus(keyResult.response, 201)) as CreateApiKeyResponse

      await expectTeamDirectoryStatus(page, key.api_key, entityIds['San Francisco Office'], [200])
      await expectTeamDirectoryStatus(page, key.api_key, entityIds['SF Residential Team'], [
        401,
        403,
      ])
    })
  })

  test.describe('sibling branch admins', () => {
    test.use({ persona: 'eastAdmin' })

    test('east admin can manage East Coast keys but is denied for West Coast entities', async ({
      page,
    }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()

      const accessToken = await getAccessToken(page)

      const allowedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['East Coast Region'],
        {
          name: `Playwright East Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
          inheritFromTree: true,
        }
      )
      await expectJsonStatus(allowedPrincipalResult.response, 201)

      const deniedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['West Coast Region'],
        {
          name: `Playwright East Denied Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
          inheritFromTree: true,
        }
      )
      expect(deniedPrincipalResult.response.status()).toBe(403)
    })
  })

  test.describe('read-only and operational users', () => {
    test.use({ persona: 'auditor' })

    test('auditor stays denied in both UI and direct API', async ({ page }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByText('Insufficient permissions')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create service account' })).toHaveCount(0)

      const accessToken = await getAccessToken(page)
      const deniedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['San Francisco Office'],
        {
          name: `Playwright Auditor Denied Principal ${timestamp}`,
          allowedScopes: ['membership:read'],
          inheritFromTree: false,
        }
      )
      expect(deniedPrincipalResult.response.status()).toBe(403)
    })
  })

  test.describe('operational users', () => {
    test.use({ persona: 'teamLead' })

    test('team lead stays denied in both UI and direct API', async ({ page }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByText('Insufficient permissions')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create service account' })).toHaveCount(0)

      const accessToken = await getAccessToken(page)
      const deniedPrincipalResult = await createEntityIntegrationPrincipal(
        page,
        accessToken,
        entityIds['SF Residential Team'],
        {
          name: `Playwright Team Lead Denied Principal ${timestamp}`,
          allowedScopes: ['membership:read'],
          inheritFromTree: false,
        }
      )
      expect(deniedPrincipalResult.response.status()).toBe(403)
    })
  })

  test.describe('superusers', () => {
    test.use({ persona: 'admin' })

    test('superuser can create platform-global integrations and revoke their runtime access', async ({
      page,
    }) => {
      const timestamp = Date.now()
      const entityIds = await getFixtureEntityIds()

      await gotoApiKeysWorkspace(page)
      await expect(page.getByRole('button', { name: 'Create service account' })).toBeVisible()

      const accessToken = await getAccessToken(page)
      const permissionNames = await getPermissionNames(page, accessToken)
      expect(
        permissionNames.includes('*:*') ||
          ['api_key:create_tree', 'api_key:read_tree', 'membership:read_tree'].every(
            (permission) => permissionNames.includes(permission)
          )
      ).toBe(true)

      const principalResult = await createPlatformGlobalIntegrationPrincipal(
        page,
        accessToken,
        {
          name: `Playwright Global Principal ${timestamp}`,
          allowedScopes: ['membership:read_tree'],
        }
      )
      const principal = (await expectJsonStatus(
        principalResult.response,
        201
      )) as IntegrationPrincipalResponse

      expect(principal.scope_kind).toBe('platform_global')
      expect(principal.anchor_entity_id).toBeNull()

      const keyResult = await createSystemIntegrationKey(page, accessToken, {
        scopeKind: 'platform_global',
        principalId: principal.id,
        name: `Playwright Global Key ${timestamp}`,
        scopes: ['membership:read_tree'],
      })
      const key = (await expectJsonStatus(keyResult.response, 201)) as CreateApiKeyResponse

      await expectTeamDirectoryStatus(page, key.api_key, entityIds['SF Residential Team'], [200])

      const revokeResponse = await revokeSystemIntegrationKey(page, accessToken, {
        scopeKind: 'platform_global',
        principalId: principal.id,
        keyId: key.id,
      })
      expect(revokeResponse.status()).toBe(204)

      await expectTeamDirectoryStatus(page, key.api_key, entityIds['SF Residential Team'], [
        401,
        403,
      ])
    })
  })
})
