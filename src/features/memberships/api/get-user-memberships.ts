import type { UserMembership } from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function getUserMemberships(userId: string) {
  return apiClient.get<UserMembership[]>(`/memberships/user/${userId}?page=1&limit=100`)
}
