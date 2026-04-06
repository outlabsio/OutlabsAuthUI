import { queryOptions } from '@tanstack/react-query'

import { getMyMemberships } from '@/features/memberships/api/get-my-memberships'
import { getUserMemberships } from '@/features/memberships/api/get-user-memberships'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import type { GetUserMembershipsParams } from '@/features/memberships/types/memberships.types'

export function getMyMembershipsQueryOptions(
  params: GetUserMembershipsParams = {}
) {
  const includeInactive = params.includeInactive ?? false

  return queryOptions({
    queryKey: membershipsKeys.myList(includeInactive),
    queryFn: () => getMyMemberships(params),
  })
}

export function getUserMembershipsQueryOptions(
  userId: string,
  params: GetUserMembershipsParams = {}
) {
  const includeInactive = params.includeInactive ?? false

  return queryOptions({
    queryKey: membershipsKeys.userList(userId, includeInactive),
    queryFn: () => getUserMemberships(userId, params),
  })
}
