import { buildIntegrationPrincipalCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  CreateIntegrationPrincipalInput,
  IntegrationPrincipal,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function createIntegrationPrincipal({
  scopeKind,
  entityId,
  ...body
}: CreateIntegrationPrincipalInput) {
  return apiClient.post<IntegrationPrincipal>(
    buildIntegrationPrincipalCollectionPath({ scopeKind, entityId }),
    {
      body,
    }
  )
}
