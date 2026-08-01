import type { RemoveMembershipInput } from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function removeMembership(input: RemoveMembershipInput) {
  return apiClient.delete<void>(`/memberships/${input.entityId}/${input.userId}`)
}
