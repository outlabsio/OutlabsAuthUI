import { buildIntegrationPrincipalKeyCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type { DeleteSystemIntegrationApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function deleteSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  keyId,
}: DeleteSystemIntegrationApiKeyInput) {
  return apiClient.delete<void>(
    `${buildIntegrationPrincipalKeyCollectionPath({
      scopeKind,
      entityId,
      principalId,
    })}/${keyId}`
  )
}
