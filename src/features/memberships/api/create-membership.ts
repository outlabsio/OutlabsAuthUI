import type {
  CreateMembershipInput,
  UserMembership,
} from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function createMembership(input: CreateMembershipInput) {
  return apiClient.post<UserMembership>('/memberships/', {
    body: {
      user_id: input.userId,
      entity_id: input.entityId,
      role_ids: input.roleIds,
      status: input.status,
      valid_from: input.validFrom ?? null,
      valid_until: input.validUntil ?? null,
      reason: input.reason ?? null,
    },
  })
}
