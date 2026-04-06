import type { ApiKey } from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function getMyApiKeys() {
  return apiClient.get<ApiKey[]>('/api-keys')
}
