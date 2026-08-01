import type { UserRoleMembership } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUserRoleMemberships(
  userId: string,
  filters?: { includeInactive?: boolean },
  options: { signal?: AbortSignal } = {}
) {
  const searchParams = new URLSearchParams()

  if (filters?.includeInactive) {
    searchParams.set('include_inactive', 'true')
  }

  const query = searchParams.toString()

  return apiClient.get<UserRoleMembership[]>(
    `/users/${userId}/role-memberships${query ? `?${query}` : ''}`,
    { signal: options.signal }
  )
}
