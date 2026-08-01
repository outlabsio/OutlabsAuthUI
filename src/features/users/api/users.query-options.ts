import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { getOrphanedUsers } from '@/features/users/api/get-orphaned-users'
import { getUserApiKeys } from '@/features/users/api/get-user-api-keys'
import { getUserSessions } from '@/features/users/api/get-user-sessions'
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
  OrphanedUsersListFilters,
  UsersListFilters,
} from '@/features/users/types/users.types'

export function getUsersQueryOptions(filters: UsersListFilters) {
  return queryOptions({
    queryKey: usersKeys.list(filters),
    queryFn: ({ signal }) => getUsers(filters, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getOrphanedUsersQueryOptions(filters: OrphanedUsersListFilters) {
  return queryOptions({
    queryKey: usersKeys.orphanedList(filters),
    queryFn: ({ signal }) => getOrphanedUsers(filters, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getUserQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.detail(userId),
    queryFn: ({ signal }) => getUser(userId, { signal }),
  })
}

export function getUserRolesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.roles(userId),
    queryFn: ({ signal }) => getUserRoles(userId, { signal }),
  })
}

export function getUserAuditEventsQueryOptions(
  userId: string,
  params: GetUserAuditEventsParams = {}
) {
  return queryOptions({
    queryKey: usersKeys.auditEvents(userId, params),
    queryFn: ({ signal }) => getUserAuditEvents(userId, params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getUserMembershipHistoryQueryOptions(
  userId: string,
  params: GetUserMembershipHistoryParams = {}
) {
  return queryOptions({
    queryKey: usersKeys.membershipHistory(userId, params),
    queryFn: ({ signal }) => getUserMembershipHistory(userId, params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getUserRoleMembershipsQueryOptions(
  userId: string,
  options?: { includeInactive?: boolean }
) {
  return queryOptions({
    queryKey: usersKeys.roleMembershipsList(userId, options),
    queryFn: ({ signal }) => getUserRoleMemberships(userId, options, { signal }),
  })
}

export function getUserPermissionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.permissions(userId),
    queryFn: ({ signal }) => getUserPermissions(userId, { signal }),
  })
}

export function getUserApiKeysQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.apiKeys(userId),
    queryFn: ({ signal }) => getUserApiKeys(userId, { signal }),
  })
}

export function getUserSessionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: usersKeys.sessions(userId),
    queryFn: ({ signal }) => getUserSessions(userId, { signal }),
  })
}
