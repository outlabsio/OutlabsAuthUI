import type { User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUser(userId: string) {
  return apiClient.get<User>(`/users/${userId}`)
}
