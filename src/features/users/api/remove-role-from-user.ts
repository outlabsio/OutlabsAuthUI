import type { RemoveUserRoleInput } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function removeRoleFromUser(input: RemoveUserRoleInput) {
  return apiClient.delete<void>(`/users/${input.userId}/roles/${input.roleId}`)
}
