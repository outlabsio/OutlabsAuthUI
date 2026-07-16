import { buildIntegrationPrincipalKeyCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  ApiKeysListResponse,
  ListIntegrationPrincipalApiKeysParams,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

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
    `${buildIntegrationPrincipalKeyCollectionPath({
      scopeKind,
      entityId,
      principalId,
    })}?${searchParams.toString()}`
  )
}
