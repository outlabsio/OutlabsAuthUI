import type {
  UpdateUserRoleMembershipInput,
  UserRoleAssignment,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function updateUserRoleMembership(input: UpdateUserRoleMembershipInput) {
  return apiClient.patch<UserRoleAssignment>(
    `/users/${input.userId}/role-memberships/${input.membershipId}`,
    {
      body: {
        ...(input.valid_from !== undefined ? { valid_from: input.valid_from } : {}),
        ...(input.valid_until !== undefined ? { valid_until: input.valid_until } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    },
  )
}
