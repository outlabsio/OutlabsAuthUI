import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type {
  AssignUserRoleInput,
  CreateUserInput,
  InviteUserInput,
  ResetUserPasswordInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  User,
  UserRoleMembership,
  UsersListFilters,
  UsersListResponse
} from '~/types/user'
import type { Role } from '~/types/role'
import type { UserSession } from '~/types/account'

// A3 — the reference resource vertical. Pinia Colada owns all server state for users.
// Key convention: ['users', 'list', filters] for lists, ['users', 'detail', id] for details.
// Mutations invalidate the resource root key ['users'] on settle. Every other resource
// (roles, permissions, api-keys, entities, ...) is a copy of this shape.

const USERS_ROOT = 'users' as const

function buildUsersQueryString(filters: UsersListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 20)
  })
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.rootEntityId) params.set('root_entity_id', filters.rootEntityId)
  return params.toString()
}

export const usersListQuery = defineQueryOptions((filters: UsersListFilters) => ({
  key: [USERS_ROOT, 'list', filters],
  query: ctx =>
    apiClient.get<UsersListResponse>(`/users/?${buildUsersQueryString(filters)}`, { signal: ctx?.signal })
}))

export const userDetailQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId],
  query: ctx => apiClient.get<User>(`/users/${userId}`, { signal: ctx?.signal })
}))

// Users with no entity membership (GET /users/orphaned) — a distinct list from the status-filtered one.
export const usersOrphanedQuery = defineQueryOptions((filters: { page?: number, limit?: number, search?: string }) => {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 20) })
  if (filters.search) params.set('search', filters.search)
  return {
    key: [USERS_ROOT, 'orphaned', filters],
    query: (ctx: { signal?: AbortSignal }) => apiClient.get<UsersListResponse>(`/users/orphaned?${params.toString()}`, { signal: ctx?.signal })
  }
})

export const userRolesQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId, 'roles'],
  query: ctx => apiClient.get<Role[]>(`/users/${userId}/roles`, { signal: ctx?.signal })
}))

export const userSessionsQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId, 'sessions'],
  query: ctx => apiClient.get<UserSession[]>(`/users/${userId}/sessions`, { signal: ctx?.signal })
}))

export function useCreateUser() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreateUserInput) => apiClient.post<User>('/users/', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

// Invite by email (POST /auth/invite). Creates an INVITED account; entity_id also adds a membership.
export function useInviteUser() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: InviteUserInput) => apiClient.post<User>('/auth/invite', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

export function useUpdateUser() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ userId, input }: { userId: string, input: UpdateUserInput }) =>
      apiClient.patch<User>(`/users/${userId}`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

export function useDeleteUser() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (userId: string) => apiClient.delete<undefined>(`/users/${userId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

// Direct role assignments (with validity), distinct from roles granted via entity membership.
export const userRoleMembershipsQuery = defineQueryOptions((userId: string) => ({
  key: [USERS_ROOT, 'detail', userId, 'role-memberships'],
  query: ctx => apiClient.get<UserRoleMembership[]>(`/users/${userId}/role-memberships`, { signal: ctx?.signal })
}))

export function useAssignUserRole() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ userId, roleId, valid_from, valid_until }: AssignUserRoleInput) =>
      apiClient.post(`/users/${userId}/roles`, { body: { role_id: roleId, valid_from, valid_until } }),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

export function useRemoveUserRole() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ userId, roleId }: { userId: string, roleId: string }) =>
      apiClient.delete<undefined>(`/users/${userId}/roles/${roleId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

// Admin: change account status (activate / suspend / ban); 'deleted' is via DELETE, not here.
export function useUpdateUserStatus() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ userId, status, suspended_until, reason }: UpdateUserStatusInput) =>
      apiClient.patch<User>(`/users/${userId}/status`, { body: { status, suspended_until, reason } }),
    onSettled: () => queryCache.invalidateQueries({ key: [USERS_ROOT] })
  })
}

// Admin: reset a user's password without their current one (PATCH /users/{id}/password → 204).
export function useResetUserPassword() {
  return useMutation({
    mutation: ({ userId, new_password }: ResetUserPasswordInput) =>
      apiClient.patch<undefined>(`/users/${userId}/password`, { body: { new_password } })
  })
}
