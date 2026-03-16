import { queryOptions } from '@tanstack/react-query'

import { getUsers } from '@/features/users/api/get-users'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UsersListFilters } from '@/features/users/types/users.types'

export function getUsersQueryOptions(filters: UsersListFilters) {
  return queryOptions({
    queryKey: usersKeys.list(filters),
    queryFn: () => getUsers(filters),
  })
}
