import { buildIntegrationPrincipalKeyCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  ApiKey,
  UpdateSystemIntegrationApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function updateSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  keyId,
  ...body
}: UpdateSystemIntegrationApiKeyInput) {
  return apiClient.patch<ApiKey>(
    `${buildIntegrationPrincipalKeyCollectionPath({
      scopeKind,
      entityId,
      principalId,
    })}/${keyId}`,
    {
      body,
    }
  )
}
