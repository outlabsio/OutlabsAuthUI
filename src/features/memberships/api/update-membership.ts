import type {
  UpdateMembershipInput,
  UserMembership,
} from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function updateMembership(input: UpdateMembershipInput) {
  return apiClient.patch<UserMembership>(
    `/memberships/${input.entityId}/${input.userId}`,
    {
      body: {
        ...(input.roleIds ? { role_ids: input.roleIds } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.validFrom !== undefined ? { valid_from: input.validFrom } : {}),
        ...(input.validUntil !== undefined ? { valid_until: input.validUntil } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    }
  )
}
