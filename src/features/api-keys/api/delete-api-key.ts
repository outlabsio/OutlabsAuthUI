import type { DeleteApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function deleteApiKey({ keyId }: DeleteApiKeyInput) {
  return apiClient.delete<void>(`/api-keys/${keyId}`)
}
