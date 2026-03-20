import { apiClient } from '@/lib/api/client'

export function deleteApiKey(keyId: string) {
  return apiClient.delete<void>(`/api-keys/${keyId}`)
}
