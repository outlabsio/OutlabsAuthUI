import type { AuthConfig } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export async function getAuthConfig(options: { signal?: AbortSignal } = {}) {
  return apiClient.get<AuthConfig>('/auth/config', { signal: options.signal })
}
