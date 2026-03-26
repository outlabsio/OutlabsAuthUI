import type {
  ApiKey,
  UpdateApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function updateApiKey({ keyId, ...input }: UpdateApiKeyInput) {
  const { entityId, ...body } = input

  return apiClient.patch<ApiKey>(`/admin/entities/${entityId}/api-keys/${keyId}`, {
    body,
  })
}
