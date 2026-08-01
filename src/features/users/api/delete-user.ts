import type { DeleteUserInput } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function deleteUser(input: DeleteUserInput) {
  return apiClient.delete<void>(`/users/${input.userId}`)
}
