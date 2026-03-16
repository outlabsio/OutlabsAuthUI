import type {
  GetUserMembershipsParams,
  UserMembership,
} from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function getUserMemberships(
  userId: string,
  params: GetUserMembershipsParams = {}
) {
  const searchParams = new URLSearchParams({
    page: '1',
    limit: '100',
  })

  if (params.includeInactive) {
    searchParams.set('include_inactive', 'true')
  }

  return apiClient.get<UserMembership[]>(
    `/memberships/user/${userId}?${searchParams.toString()}`
  )
}
