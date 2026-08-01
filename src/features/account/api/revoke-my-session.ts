import { apiClient } from '@/lib/api/client'

export function revokeMySession(sessionId: string) {
  return apiClient.delete<void>(`/users/me/sessions/${sessionId}`)
}
