import { queryOptions } from '@tanstack/react-query'

import { getUser } from '@/features/users/api/get-user'
import { getUserPermissions } from '@/features/users/api/get-user-permissions'
import { getUserRoles } from '@/features/users/api/get-user-roles'
import { getUsers } from '@/features/users/api/get-users'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UsersListFilters } from '@/features/users/types/users.types'

export function getUsersQueryOptions(filters: UsersListFilters) {
  return queryOptions({
    queryKey: usersKeys.list(filters),
    queryFn: () => getUsers(filters),
  })
}

export function getUserQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.detail(userId),
    queryFn: () => getUser(userId),
  })
}

export function getUserRolesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.roles(userId),
    queryFn: () => getUserRoles(userId),
  })
}

export function getUserPermissionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.permissions(userId),
    queryFn: () => getUserPermissions(userId),
  })
}
