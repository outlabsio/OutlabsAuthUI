import type { UpdateUserInput, User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function updateUser({
  userId,
  ...body
}: UpdateUserInput) {
  return apiClient.patch<User>(`/users/${userId}`, {
    body,
  })
}
