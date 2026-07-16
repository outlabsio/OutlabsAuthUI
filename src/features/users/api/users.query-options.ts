import { queryOptions } from '@tanstack/react-query'

import { getUserApiKeys } from '@/features/users/api/get-user-api-keys'
import { getUserAuditEvents } from '@/features/users/api/get-user-audit-events'
import { getUserMembershipHistory } from '@/features/users/api/get-user-membership-history'
import { getUser } from '@/features/users/api/get-user'
import { getUserPermissions } from '@/features/users/api/get-user-permissions'
import { getUserRoleMemberships } from '@/features/users/api/get-user-role-memberships'
import { getUserRoles } from '@/features/users/api/get-user-roles'
import { getUsers } from '@/features/users/api/get-users'
import { usersKeys } from '@/features/users/api/users.keys'
import type {
  GetUserAuditEventsParams,
  GetUserMembershipHistoryParams,
  UsersListFilters,
} from '@/features/users/types/users.types'

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

export function getUserAuditEventsQueryOptions(
  userId: string,
  params: GetUserAuditEventsParams = {}
) {
  return queryOptions({
    queryKey: usersKeys.auditEvents(userId, params),
    queryFn: () => getUserAuditEvents(userId, params),
  })
}

export function getUserMembershipHistoryQueryOptions(
  userId: string,
  params: GetUserMembershipHistoryParams = {}
) {
  return queryOptions({
    queryKey: usersKeys.membershipHistory(userId, params),
    queryFn: () => getUserMembershipHistory(userId, params),
  })
}

export function getUserRoleMembershipsQueryOptions(
  userId: string,
  options?: { includeInactive?: boolean }
) {
  return queryOptions({
    queryKey: usersKeys.roleMembershipsList(userId, options),
    queryFn: () => getUserRoleMemberships(userId, options),
  })
}

export function getUserPermissionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.permissions(userId),
    queryFn: () => getUserPermissions(userId),
  })
}

export function getUserApiKeysQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.apiKeys(userId),
    queryFn: () => getUserApiKeys(userId),
  })
}
