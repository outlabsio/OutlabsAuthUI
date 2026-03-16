import type { AuthConfig } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export async function getAuthConfig() {
  return apiClient.get<AuthConfig>('/auth/config')
}
