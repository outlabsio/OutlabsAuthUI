import type { UserSession } from '@/features/users/types/user-session.types'
import { apiClient } from '@/lib/api/client'

export function getUserSessions(userId: string) {
  return apiClient.get<UserSession[]>(`/users/${userId}/sessions`)
}
