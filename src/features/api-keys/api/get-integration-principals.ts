import { buildIntegrationPrincipalCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  IntegrationPrincipalsListResponse,
  ListIntegrationPrincipalsParams,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

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
    `${buildIntegrationPrincipalCollectionPath({ scopeKind, entityId })}?${searchParams.toString()}`
  )
}
