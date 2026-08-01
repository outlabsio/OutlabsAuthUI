import type { RevokeAllUserSessionsInput } from '@/features/users/types/user-session.types'
import { apiClient } from '@/lib/api/client'

export function revokeAllUserSessions({ userId }: RevokeAllUserSessionsInput) {
  return apiClient.delete<void>(`/users/${userId}/sessions`)
}
