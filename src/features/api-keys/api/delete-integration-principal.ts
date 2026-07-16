import { buildIntegrationPrincipalPath } from '@/features/api-keys/api/integration-principal-paths'
import type { DeleteIntegrationPrincipalInput } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function deleteIntegrationPrincipal({
  scopeKind,
  entityId,
  principalId,
}: DeleteIntegrationPrincipalInput) {
  return apiClient.delete<void>(
    buildIntegrationPrincipalPath({ scopeKind, entityId, principalId })
  )
}
