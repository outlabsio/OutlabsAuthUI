import { buildIntegrationPrincipalPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  IntegrationPrincipal,
  UpdateIntegrationPrincipalInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function updateIntegrationPrincipal({
  scopeKind,
  entityId,
  principalId,
  ...body
}: UpdateIntegrationPrincipalInput) {
  return apiClient.patch<IntegrationPrincipal>(
    buildIntegrationPrincipalPath({ scopeKind, entityId, principalId }),
    {
      body,
    }
  )
}
