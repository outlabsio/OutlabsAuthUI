import type {
  GetUserMembershipsParams,
  UserMembership,
} from '@/features/memberships/types/memberships.types'
import { apiClient } from '@/lib/api/client'

export function getMyMemberships(
  params: GetUserMembershipsParams = {},
  options: { signal?: AbortSignal } = {}
) {
  const searchParams = new URLSearchParams()

  if (params.includeInactive) {
    searchParams.set('include_inactive', 'true')
  }

  const query = searchParams.toString()

  return apiClient.get<UserMembership[]>(
    `/memberships/me${query ? `?${query}` : ''}`,
    { signal: options.signal }
  )
}
