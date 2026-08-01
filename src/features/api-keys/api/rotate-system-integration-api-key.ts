import { buildIntegrationPrincipalKeyCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  CreateApiKeyResponse,
  RotateSystemIntegrationApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function rotateSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  keyId,
}: RotateSystemIntegrationApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>(
    `${buildIntegrationPrincipalKeyCollectionPath({
      scopeKind,
      entityId,
      principalId,
    })}/${keyId}/rotate`
  )
}
