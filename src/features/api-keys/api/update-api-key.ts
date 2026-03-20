import type {
  ApiKey,
  UpdateApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function updateApiKey({ keyId, ...input }: UpdateApiKeyInput) {
  return apiClient.patch<ApiKey>(`/api-keys/${keyId}`, {
    body: input,
  })
}
