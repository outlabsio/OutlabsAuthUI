import type { RevokeUserApiKeyInput } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function revokeUserApiKey({ userId, keyId }: RevokeUserApiKeyInput) {
  return apiClient.delete<void>(`/users/${userId}/api-keys/${keyId}`)
}
