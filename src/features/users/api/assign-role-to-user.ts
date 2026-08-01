import type {
  AssignUserRoleInput,
  UserRoleAssignment,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function assignRoleToUser(input: AssignUserRoleInput) {
  return apiClient.post<UserRoleAssignment>(`/users/${input.userId}/roles`, {
    body: {
      role_id: input.roleId,
      valid_from: input.valid_from,
      valid_until: input.valid_until,
    },
  })
}
