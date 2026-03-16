import type { UserRoleMembership } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUserRoleMemberships(
  userId: string,
  options?: { includeInactive?: boolean }
) {
  const searchParams = new URLSearchParams()

  if (options?.includeInactive) {
    searchParams.set('include_inactive', 'true')
  }

  const query = searchParams.toString()

  return apiClient.get<UserRoleMembership[]>(
    `/users/${userId}/role-memberships${query ? `?${query}` : ''}`
  )
}
