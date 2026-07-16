import type { RevokeUserSessionInput } from '@/features/users/types/user-session.types'
import { apiClient } from '@/lib/api/client'

export function revokeUserSession({ userId, sessionId }: RevokeUserSessionInput) {
  return apiClient.delete<void>(`/users/${userId}/sessions/${sessionId}`)
}
