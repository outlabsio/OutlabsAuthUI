import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UsersListFilters,
  UsersListResponse
} from '~/types/user'

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

export function useCreateUser() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreateUserInput) => apiClient.post<User>('/users/', { body: input }),
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
