import type { DeleteEntityApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function deleteEntityApiKey({ entityId, keyId }: DeleteEntityApiKeyInput) {
  return apiClient.delete<void>(`/admin/entities/${entityId}/api-keys/${keyId}`)
}
