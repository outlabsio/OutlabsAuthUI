import type { UserSession } from '@/features/users/types/user-session.types'
import { apiClient } from '@/lib/api/client'

export function getMySessions(options: { signal?: AbortSignal } = {}) {
  return apiClient.get<UserSession[]>('/users/me/sessions', {
    signal: options.signal,
  })
}
