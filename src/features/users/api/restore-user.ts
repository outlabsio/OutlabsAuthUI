import type { RestoreUserInput, User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function restoreUser({ userId }: RestoreUserInput) {
  return apiClient.post<User>(`/users/${userId}/restore`)
}
