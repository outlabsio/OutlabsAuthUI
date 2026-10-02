import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { keepPreviousPage } from '~/queries/freshness'
import { useInvalidateAfter } from '~/queries/invalidation'
import type {
  AssignUserRoleInput,
  CreateUserInput,
  InviteUserInput,
  ResetUserPasswordInput,
  UpdateUserInput,
  UpdateUserRoleMembershipInput,
  UpdateUserStatusInput,
  User,
  UserMembershipHistoryResponse,
  OrphanedUsersFilters,
  OrphanedUsersListResponse,
  UserRoleMembership,
  UsersListFilters,
  UsersListResponse
} from '~/types/user'
import type { UserSession } from '~/types/account'
import type { UserPermissionSource } from '~/types/permission'
import type { AuditEventsResponse } from '~/types/audit'
import type { ApiKey } from '~/types/api-key'

// A3 — the reference resource vertical. Pinia Colada owns all server state for users.
// Key convention: ['users', 'list', filters] for lists, ['users', 'detail', id] for details.
// Mutations call invalidateAfter(domain) on settle (queries/invalidation.ts): the users root plus
// every view the write shows up in, never awaited. Every other resource (roles, permissions,
// api-keys, entities, ...) is a copy of this shape.

const USERS_ROOT = 'users' as const

function buildUsersQueryString(filters: UsersListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 20)
  })
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.isSuperuser !== undefined) params.set('is_superuser', String(filters.isSuperuser))
  if (filters.rootEntityId) params.set('root_entity_id', filters.rootEntityId)
  return params.toString()
}

// Also the pool behind the add-member user picker, so the users page adds keepPreviousPage at
// its call site rather than here.
export const usersListQuery = defineQueryOptions((filters: UsersListFilters) => ({
  key: [USERS_ROOT, 'list', filters],
  query: ctx =>
    apiClient.get<UsersListResponse>(`/users/?${buildUsersQueryString(filters)}`, { signal: ctx?.signal })
}))

export const userDetailQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId],
  query: ctx => apiClient.get<User>(`/users/${userId}`, { signal: ctx?.signal })
}))

// Users who lost every entity membership (GET /users/orphaned: no active membership, at least
// one in the past) — a distinct list from the status-filtered one. Each item wraps the user with
// its membership summary ({ user, active_membership_count, last_entity_name, … }). The endpoint
// has no status filter and includes deleted accounts; outlabs-auth answers delegated (non-global)
// admins with an empty page.
export const usersOrphanedQuery = defineQueryOptions((filters: OrphanedUsersFilters) => {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 20) })
  if (filters.search) params.set('search', filters.search)
  if (filters.rootEntityId) params.set('root_entity_id', filters.rootEntityId)
  return {
    key: [USERS_ROOT, 'orphaned', filters],
    query: (ctx: { signal?: AbortSignal }) => apiClient.get<OrphanedUsersListResponse>(`/users/orphaned?${params.toString()}`, { signal: ctx?.signal }),
    placeholderData: keepPreviousPage<OrphanedUsersListResponse>
  }
})

// One page of a user's retained histories (audit timeline, membership history). The Access tab
// reads the first membership-history page for role names, so both use this size and share it.
export const USER_HISTORY_PAGE_SIZE = 10

export const userSessionsQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId, 'sessions'],
  query: ctx => apiClient.get<UserSession[]>(`/users/${userId}/sessions`, { signal: ctx?.signal })
}))

// Admin inventory of this identity's personal keys. This deliberately reuses the shared
// metadata-only ApiKey shape: the backend response never includes a plaintext `api_key`.
export const userApiKeysQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId, 'api-keys'],
  query: ctx => apiClient.get<ApiKey[]>(`/users/${userId}/api-keys`, { signal: ctx?.signal })
}))

// Per-user retained histories. These are intentionally separate from the global audit query:
// the backend's user endpoints include only this identity's records and membership lifecycle.
// Both are paginated, newest-first streams and remain read-only server state.
export const userAuditEventsQuery = defineQueryOptions((params: { userId: string, page?: number, limit?: number, category?: string }) => {
  const page = params.page ?? 1
  const limit = params.limit ?? USER_HISTORY_PAGE_SIZE
  const category = params.category || undefined
  const search = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (category) search.set('category', category)
  return {
    key: [USERS_ROOT, 'detail', params.userId, 'audit-events', { page, limit, category }],
    query: (ctx: { signal?: AbortSignal }) =>
      apiClient.get<AuditEventsResponse>(`/users/${params.userId}/audit-events?${search.toString()}`, { signal: ctx?.signal }),
    // Pages of one user's history; never carried over to another user.
    placeholderData: (previous: AuditEventsResponse | undefined, previousEntry: { key: readonly unknown[] } | undefined) =>
      previousEntry?.key[2] === params.userId ? previous : undefined
  }
})

export const userMembershipHistoryQuery = defineQueryOptions((params: { userId: string, page?: number, limit?: number }) => {
  const page = params.page ?? 1
  const limit = params.limit ?? USER_HISTORY_PAGE_SIZE
  const search = new URLSearchParams({ page: String(page), limit: String(limit) })
  return {
    key: [USERS_ROOT, 'detail', params.userId, 'membership-history', { page, limit }],
    query: (ctx: { signal?: AbortSignal }) =>
      apiClient.get<UserMembershipHistoryResponse>(`/users/${params.userId}/membership-history?${search.toString()}`, { signal: ctx?.signal }),
    placeholderData: (previous: UserMembershipHistoryResponse | undefined, previousEntry: { key: readonly unknown[] } | undefined) =>
      previousEntry?.key[2] === params.userId ? previous : undefined
  }
})

export function useCreateUser() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (input: CreateUserInput) => apiClient.post<User>('/users/', { body: input }),
    onSettled: () => invalidate('user')
  })
}

// Invite by email (POST /auth/invite). Creates an INVITED account; entity_id also adds a membership.
export function useInviteUser() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (input: InviteUserInput) => apiClient.post<User>('/auth/invite', { body: input }),
    onSettled: () => invalidate('user')
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, input }: { userId: string, input: UpdateUserInput }) =>
      apiClient.patch<User>(`/users/${userId}`, { body: input }),
    onSettled: (_data, _error, { userId }) => invalidate('user', { targetUserId: userId })
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (userId: string) => apiClient.delete<undefined>(`/users/${userId}`),
    onSettled: (_data, _error, userId) => invalidate('user', { targetUserId: userId })
  })
}

// Direct role assignments (with validity), distinct from roles granted via entity membership. The
// endpoint is active-only by default; the user detail reads every status (includeInactive) so a
// suspended assignment stays on screen and ended ones can be shown and reactivated.
export const userRoleMembershipsQuery = defineQueryOptions((params: { userId: string, includeInactive?: boolean }) => ({
  key: [USERS_ROOT, 'detail', params.userId, 'role-memberships', { includeInactive: !!params.includeInactive }],
  query: (ctx: { signal?: AbortSignal }) => apiClient.get<UserRoleMembership[]>(
    `/users/${params.userId}/role-memberships${params.includeInactive ? '?include_inactive=true' : ''}`,
    { signal: ctx?.signal }
  )
}))

// What an account's grants in force give it (GET /users/{id}/permissions; the account itself,
// or user:read): each permission once, with a role that grants it. Under the user's detail key,
// so every role, membership and user write refreshes it.
export const userPermissionsQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId, 'permissions'],
  query: ctx => apiClient.get<UserPermissionSource[]>(`/users/${userId}/permissions`, { signal: ctx?.signal })
}))

// One role's answer in a multi-role assignment.
export type RoleAssignOutcome = { roleId: string, ok: true } | { roleId: string, ok: false, error: unknown }

// Direct role assignment, one or several roles in one action (F-176). The endpoint assigns one
// role per request; every selected role is tried, in order, and each answer is reported
// (assignOutcomeSummary in utils/access-grants.ts), so one refusal neither hides which roles
// were assigned nor skips the rest. When every role fails, the first error is thrown, so the
// caller reports it like any failed write (field, permissions, not found). The related views are
// invalidated once, after the last answer.
export function useAssignUserRoles() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: async ({ userId, roleIds, valid_from, valid_until }: Omit<AssignUserRoleInput, 'roleId'> & { roleIds: string[] }) => {
      const outcomes: RoleAssignOutcome[] = []
      for (const roleId of roleIds) {
        try {
          await apiClient.post(`/users/${userId}/roles`, { body: { role_id: roleId, valid_from, valid_until } })
          outcomes.push({ roleId, ok: true })
        } catch (error) {
          outcomes.push({ roleId, ok: false, error })
        }
      }
      const failed = outcomes.filter(outcome => !outcome.ok)
      if (failed.length && failed.length === outcomes.length) throw (failed[0] as { error: unknown }).error
      return outcomes
    },
    onSettled: (_data, _error, { userId }) => invalidate('userRoles', { targetUserId: userId })
  })
}

export function useRemoveUserRole() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, roleId }: { userId: string, roleId: string }) =>
      apiClient.delete<undefined>(`/users/${userId}/roles/${roleId}`),
    onSettled: (_data, _error, { userId }) => invalidate('userRoles', { targetUserId: userId })
  })
}

// Edit an existing direct role assignment's validity window and/or status (not the role itself —
// changing which role is granted means remove + re-assign). Also reactivates an ended assignment
// (status active) and ends a suspended one (status revoked: DELETE only revokes an active one).
export function useUpdateUserRoleMembership() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, membershipId, input }: { userId: string, membershipId: string, input: UpdateUserRoleMembershipInput }) =>
      apiClient.patch<UserRoleMembership>(`/users/${userId}/role-memberships/${membershipId}`, { body: input }),
    onSettled: (_data, _error, { userId }) => invalidate('userRoles', { targetUserId: userId })
  })
}

// Admin: change account status (activate / suspend / ban); 'deleted' is via DELETE, not here.
export function useUpdateUserStatus() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, status, suspended_until, reason }: UpdateUserStatusInput) =>
      apiClient.patch<User>(`/users/${userId}/status`, { body: { status, suspended_until, reason } }),
    onSettled: (_data, _error, { userId }) => invalidate('user', { targetUserId: userId })
  })
}

// Admin: reset a user's password without their current one (PATCH /users/{id}/password → 204).
export function useResetUserPassword() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, new_password }: ResetUserPasswordInput) =>
      apiClient.patch<undefined>(`/users/${userId}/password`, { body: { new_password } }),
    // The reset ends the user's sessions and is audited.
    onSettled: (_data, _error, { userId }) => invalidate('user', { targetUserId: userId })
  })
}

// Admin force sign-out (F-014): DELETE /users/{id}/sessions/{sid} ends one session, DELETE
// /users/{id}/sessions every one (user:update; audited as user.sessions_revoked). The refresh
// token stops working at once; an access token already issued lasts until it expires unless the
// host enables the token blacklist.
export function useRevokeUserSession() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, sessionId }: { userId: string, sessionId: string }) =>
      apiClient.delete<undefined>(`/users/${userId}/sessions/${sessionId}`),
    onSettled: (_data, _error, { userId }) => invalidate('userSessions', { targetUserId: userId })
  })
}

export function useRevokeAllUserSessions() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (userId: string) => apiClient.delete<undefined>(`/users/${userId}/sessions`),
    onSettled: (_data, _error, userId) => invalidate('userSessions', { targetUserId: userId })
  })
}

// Admin incident-response action for one of this user's personal keys. The backend retains the
// key as `revoked`, so invalidating the user detail root refreshes the visible inventory.
export function useRevokeUserApiKey() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, keyId }: { userId: string, keyId: string }) =>
      apiClient.delete<undefined>(`/users/${userId}/api-keys/${keyId}`),
    onSettled: () => invalidate('apiKey')
  })
}

// Gap-backlog #2 — the user lifecycle trio.

// Resend the invitation (POST /users/{id}/resend-invite). Backend regenerates the invite
// token and re-fires the invite hook; INVITED-status users only (user:update).
export function useResendInvite() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (userId: string) => apiClient.post<User>(`/users/${userId}/resend-invite`, { body: {} }),
    onSettled: (_data, _error, userId) => invalidate('user', { targetUserId: userId })
  })
}

// Restore a soft-deleted user identity (POST /users/{id}/restore). Access grants and
// credentials are NOT restored (user:update).
export function useRestoreUser() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (userId: string) => apiClient.post<User>(`/users/${userId}/restore`, { body: {} }),
    onSettled: (_data, _error, userId) => invalidate('user', { targetUserId: userId })
  })
}

// Grant/revoke platform superuser (PATCH /users/{id}/superuser). Superuser-only endpoint; the
// reason is recorded on the audited user.superuser_granted / _revoked event (F-175).
export function useUpdateUserSuperuser() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ userId, is_superuser, reason }: { userId: string, is_superuser: boolean, reason?: string }) =>
      apiClient.patch<User>(`/users/${userId}/superuser`, { body: { is_superuser, reason } }),
    onSettled: (_data, _error, { userId }) => invalidate('user', { targetUserId: userId })
  })
}
