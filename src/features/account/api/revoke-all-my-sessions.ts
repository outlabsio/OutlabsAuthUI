import { apiClient } from '@/lib/api/client'

export function revokeAllMySessions() {
  return apiClient.delete<void>('/users/me/sessions')
}
