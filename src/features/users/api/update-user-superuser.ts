import type {
  UpdateUserSuperuserInput,
  User,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function updateUserSuperuser({
  userId,
  ...body
}: UpdateUserSuperuserInput) {
  return apiClient.patch<User>(`/users/${userId}/superuser`, {
    body,
  })
}
