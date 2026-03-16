import type { SessionUser } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function getSession() {
  return apiClient.get<SessionUser>('/users/me')
}
