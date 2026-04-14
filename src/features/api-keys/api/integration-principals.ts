import type {
  ApiKey,
  CreateSystemIntegrationApiKeyInput,
  CreateApiKeyResponse,
  DeleteIntegrationPrincipalInput,
  DeleteSystemIntegrationApiKeyInput,
  IntegrationPrincipalsListResponse,
  ListIntegrationPrincipalApiKeysParams,
  ListIntegrationPrincipalsParams,
  ApiKeysListResponse,
  CreateIntegrationPrincipalInput,
  IntegrationPrincipal,
  RotateSystemIntegrationApiKeyInput,
  UpdateIntegrationPrincipalInput,
  UpdateSystemIntegrationApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

function buildPrincipalCollectionPath({
  scopeKind,
  entityId,
}: {
  scopeKind: 'entity' | 'platform_global'
  entityId?: string
}) {
  if (scopeKind === 'entity') {
    if (!entityId) {
      throw new Error('entityId is required for entity-scoped integration principals')
    }

    return `/admin/entities/${entityId}/integration-principals`
  }

  return '/admin/system/integration-principals'
}

function buildPrincipalPath({
  scopeKind,
  entityId,
  principalId,
}: {
  scopeKind: 'entity' | 'platform_global'
  entityId?: string
  principalId: string
}) {
  return `${buildPrincipalCollectionPath({ scopeKind, entityId })}/${principalId}`
}

function buildPrincipalKeyCollectionPath({
  scopeKind,
  entityId,
  principalId,
}: {
  scopeKind: 'entity' | 'platform_global'
  entityId?: string
  principalId: string
}) {
  return `${buildPrincipalPath({ scopeKind, entityId, principalId })}/api-keys`
}

export function getIntegrationPrincipals({
  scopeKind,
  entityId,
  page = 1,
  limit = 100,
  status,
  search,
}: ListIntegrationPrincipalsParams) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (status) {
    searchParams.set('status', status)
  }

  if (search) {
    searchParams.set('search', search)
  }

  return apiClient.get<IntegrationPrincipalsListResponse>(
    `${buildPrincipalCollectionPath({ scopeKind, entityId })}?${searchParams.toString()}`
  )
}

export function createIntegrationPrincipal({
  scopeKind,
  entityId,
  ...body
}: CreateIntegrationPrincipalInput) {
  return apiClient.post<IntegrationPrincipal>(buildPrincipalCollectionPath({ scopeKind, entityId }), {
    body,
  })
}

export function updateIntegrationPrincipal({
  scopeKind,
  entityId,
  principalId,
  ...body
}: UpdateIntegrationPrincipalInput) {
  return apiClient.patch<IntegrationPrincipal>(
    buildPrincipalPath({ scopeKind, entityId, principalId }),
    {
      body,
    }
  )
}

export function deleteIntegrationPrincipal({
  scopeKind,
  entityId,
  principalId,
}: DeleteIntegrationPrincipalInput) {
  return apiClient.delete<void>(buildPrincipalPath({ scopeKind, entityId, principalId }))
}

export function getIntegrationPrincipalApiKeys({
  scopeKind,
  entityId,
  principalId,
  page = 1,
  limit = 100,
  status,
  search,
}: ListIntegrationPrincipalApiKeysParams) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (status) {
    searchParams.set('status', status)
  }

  if (search) {
    searchParams.set('search', search)
  }

  return apiClient.get<ApiKeysListResponse>(
    `${buildPrincipalKeyCollectionPath({ scopeKind, entityId, principalId })}?${searchParams.toString()}`
  )
}

export function createSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  ...body
}: CreateSystemIntegrationApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>(
    buildPrincipalKeyCollectionPath({ scopeKind, entityId, principalId }),
    {
      body,
    }
  )
}

export function updateSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  keyId,
  ...body
}: UpdateSystemIntegrationApiKeyInput) {
  return apiClient.patch<ApiKey>(
    `${buildPrincipalKeyCollectionPath({ scopeKind, entityId, principalId })}/${keyId}`,
    {
      body,
    }
  )
}

export function deleteSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  keyId,
}: DeleteSystemIntegrationApiKeyInput) {
  return apiClient.delete<void>(
    `${buildPrincipalKeyCollectionPath({ scopeKind, entityId, principalId })}/${keyId}`
  )
}

export function rotateSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  keyId,
}: RotateSystemIntegrationApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>(
    `${buildPrincipalKeyCollectionPath({ scopeKind, entityId, principalId })}/${keyId}/rotate`
  )
}
