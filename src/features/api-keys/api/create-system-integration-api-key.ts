import { buildIntegrationPrincipalKeyCollectionPath } from '@/features/api-keys/api/integration-principal-paths'
import type {
  CreateApiKeyResponse,
  CreateSystemIntegrationApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function createSystemIntegrationApiKey({
  scopeKind,
  entityId,
  principalId,
  ...body
}: CreateSystemIntegrationApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>(
    buildIntegrationPrincipalKeyCollectionPath({ scopeKind, entityId, principalId }),
    {
      body,
    }
  )
}
