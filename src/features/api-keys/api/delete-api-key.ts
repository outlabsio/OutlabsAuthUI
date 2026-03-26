import type { DeleteApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function deleteApiKey({ entityId, keyId }: DeleteApiKeyInput) {
  return apiClient.delete<void>(`/admin/entities/${entityId}/api-keys/${keyId}`)
}
