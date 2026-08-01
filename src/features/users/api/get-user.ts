import type { User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUser(userId: string, options: { signal?: AbortSignal } = {}) {
  return apiClient.get<User>(`/users/${userId}`, { signal: options.signal })
}
