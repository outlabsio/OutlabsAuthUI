import { apiClient } from '@/lib/api/client'

export function getMyPermissions(options: { signal?: AbortSignal } = {}) {
  return apiClient.get<string[]>('/permissions/me', { signal: options.signal })
}
