import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type {
  CreateRoleInput,
  Role,
  RolesListFilters,
  RolesListResponse,
  UpdateRoleInput
} from '~/types/role'

// P2 vertical — a copy of queries/users.ts (the reference). Same key/invalidation shape.

const ROLES_ROOT = 'roles' as const

function buildRolesQueryString(filters: RolesListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 100)
  })
  if (filters.search) params.set('search', filters.search)
  if (typeof filters.isGlobal === 'boolean') params.set('is_global', String(filters.isGlobal))
  if (filters.rootEntityId) params.set('root_entity_id', filters.rootEntityId)
  return params.toString()
}

export const rolesListQuery = defineQueryOptions((filters: RolesListFilters) => ({
  key: [ROLES_ROOT, 'list', filters],
  query: ctx =>
    apiClient.get<RolesListResponse>(`/roles/?${buildRolesQueryString(filters)}`, { signal: ctx?.signal })
}))

export const roleDetailQuery = defineQueryOptions((roleId: string) => ({
  key: [ROLES_ROOT, 'detail', roleId],
  query: ctx => apiClient.get<Role>(`/roles/${roleId}`, { signal: ctx?.signal })
}))

export function useCreateRole() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreateRoleInput) => apiClient.post<Role>('/roles/', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [ROLES_ROOT] })
  })
}

export function useUpdateRole() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ roleId, input }: { roleId: string, input: UpdateRoleInput }) =>
      apiClient.patch<Role>(`/roles/${roleId}`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [ROLES_ROOT] })
  })
}

export function useDeleteRole() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (roleId: string) => apiClient.delete<undefined>(`/roles/${roleId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [ROLES_ROOT] })
  })
}
