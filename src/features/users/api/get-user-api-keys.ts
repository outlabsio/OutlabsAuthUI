import type { ApiKey } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function getUserApiKeys(
  userId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<ApiKey[]>(`/users/${userId}/api-keys`, {
    signal: options.signal,
  })
}
