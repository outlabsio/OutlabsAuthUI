import { queryOptions } from '@tanstack/react-query'

import { getUserMemberships } from '@/features/memberships/api/get-user-memberships'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'

export function getUserMembershipsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: membershipsKeys.userList(userId),
    queryFn: () => getUserMemberships(userId),
  })
}
