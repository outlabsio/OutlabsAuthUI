import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { CATALOGUE_STALE_TIME } from '~/queries/freshness'
import { useInvalidateAfter } from '~/queries/invalidation'
import { collectAllPages } from '~/utils/pagination'
import type {
  CreatePermissionInput,
  Permission,
  PermissionCheckInput,
  PermissionCheckResponse,
  PermissionsListFilters,
  PermissionsListResponse,
  UpdatePermissionInput
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
    apiClient.get<PermissionsListResponse>(`/permissions/?${buildPermissionsQueryString(filters)}`, { signal: ctx?.signal }),
  // A whole-catalogue read (limit 1000) is a catalogue: every permission write invalidates it.
  // A list page keeps the global stale time.
  ...((filters.limit ?? 1000) >= 1000 ? { staleTime: CATALOGUE_STALE_TIME } : {})
}))

// Every (non-archived) permission, walking all pages (limit 1000 each). The catalogue behind
// the permissions list's resource filter and its in-browser search: GET /permissions has no
// search or is_system parameter, so those filters need the whole set. `complete` is false only
// when the walk hit its page cap; callers must say so.
export const permissionCatalogQuery = defineQueryOptions({
  key: [PERMISSIONS_ROOT, 'catalog'],
  query: ctx => collectAllPages(
    (page, limit) => apiClient.get<PermissionsListResponse>(`/permissions/?${buildPermissionsQueryString({ page, limit })}`, { signal: ctx?.signal }),
    { pageSize: 1000 }
  ),
  staleTime: CATALOGUE_STALE_TIME
})

export const permissionDetailQuery = defineQueryOptions((permissionId: string) => ({
  key: [PERMISSIONS_ROOT, 'detail', permissionId],
  query: ctx => apiClient.get<Permission>(`/permissions/${permissionId}`, { signal: ctx?.signal })
}))

export function useCreatePermission() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (input: CreatePermissionInput) => apiClient.post<Permission>('/permissions/', { body: input }),
    onSettled: () => invalidate('permission')
  })
}

// PATCH /permissions/{id} (permission:update; system permissions are refused). Send only the
// changed fields; `is_active` is the status switch (false = inactive, which grants nothing and
// cannot be attached to roles until reactivated).
export function useUpdatePermission() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ permissionId, input }: { permissionId: string, input: UpdatePermissionInput }) =>
      apiClient.patch<Permission>(`/permissions/${permissionId}`, { body: input }),
    onSettled: () => invalidate('permission')
  })
}

export function useDeletePermission() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (permissionId: string) => apiClient.delete<undefined>(`/permissions/${permissionId}`),
    onSettled: () => invalidate('permission')
  })
}

// Ask the server's own evaluator whether a user holds permissions, optionally inside one entity
// (POST /permissions/check, permission:check). A read through POST: nothing is cached or
// invalidated, the caller shows the answer it gets.
export function useCheckPermissions() {
  return useMutation({
    mutation: (input: PermissionCheckInput) => apiClient.post<PermissionCheckResponse>('/permissions/check', { body: input })
  })
}
