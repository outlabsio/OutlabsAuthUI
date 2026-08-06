import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type {
  CreatePermissionInput,
  Permission,
  PermissionsListFilters,
  PermissionsListResponse
} from '~/types/permission'

// P2 vertical — copy of queries/users.ts against /permissions.

const PERMISSIONS_ROOT = 'permissions' as const

function buildPermissionsQueryString(filters: PermissionsListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 1000)
  })
  if (filters.resource) params.set('resource', filters.resource)
  return params.toString()
}

export const permissionsListQuery = defineQueryOptions((filters: PermissionsListFilters) => ({
  key: [PERMISSIONS_ROOT, 'list', filters],
  query: ctx =>
    apiClient.get<PermissionsListResponse>(`/permissions/?${buildPermissionsQueryString(filters)}`, { signal: ctx?.signal })
}))

export const permissionDetailQuery = defineQueryOptions((permissionId: string) => ({
  key: [PERMISSIONS_ROOT, 'detail', permissionId],
  query: ctx => apiClient.get<Permission>(`/permissions/${permissionId}`, { signal: ctx?.signal })
}))

export function useCreatePermission() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreatePermissionInput) => apiClient.post<Permission>('/permissions/', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [PERMISSIONS_ROOT] })
  })
}

export function useDeletePermission() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (permissionId: string) => apiClient.delete<undefined>(`/permissions/${permissionId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [PERMISSIONS_ROOT] })
  })
}
