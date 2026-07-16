import type { UserSession } from '@/features/users/types/user-session.types'
import { apiClient } from '@/lib/api/client'

export function getMySessions() {
  return apiClient.get<UserSession[]>('/users/me/sessions')
}
