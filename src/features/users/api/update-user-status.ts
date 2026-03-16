import type {
  UpdateUserStatusInput,
  User,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function updateUserStatus({
  userId,
  ...body
}: UpdateUserStatusInput) {
  return apiClient.patch<User>(`/users/${userId}/status`, {
    body,
  })
}
