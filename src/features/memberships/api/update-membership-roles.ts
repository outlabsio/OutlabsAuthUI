import type {
  UpdateMembershipRolesInput,
  UserMembership,
} from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function updateMembershipRoles(input: UpdateMembershipRolesInput) {
  return apiClient.patch<UserMembership>(
    `/memberships/${input.entityId}/${input.userId}`,
    {
      body: {
        role_ids: input.roleIds,
      },
    }
  )
}
