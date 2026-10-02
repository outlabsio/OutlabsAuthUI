import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { CATALOGUE_STALE_TIME } from '~/queries/freshness'
import { useInvalidateAfter } from '~/queries/invalidation'
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
    apiClient.get<RolesListResponse>(`/roles/?${buildRolesQueryString(filters)}`, { signal: ctx?.signal }),
  // Unsearched role lists are the pools behind role pickers; every role write invalidates them.
  ...(filters.search ? {} : { staleTime: CATALOGUE_STALE_TIME })
}))

// Every page of a roles listing (the API caps a page at 100). Bounded so a runaway deployment
// cannot pin the tab; `truncated` tells the caller the list is incomplete instead of silently
// capping it.
const ROLES_PAGE_SIZE = 100
const ROLES_MAX_PAGES = 20

export type RolesCollection = {
  items: Role[]
  total: number
  truncated: boolean
}

async function fetchAllRolePages(path: (page: number) => string, signal?: AbortSignal): Promise<RolesCollection> {
  const items: Role[] = []
  let total = 0
  let page = 1
  for (; page <= ROLES_MAX_PAGES; page += 1) {
    const res = await apiClient.get<RolesListResponse>(path(page), { signal })
    items.push(...res.items)
    total = res.total ?? items.length
    const pages = res.pages ?? Math.ceil(total / ROLES_PAGE_SIZE)
    if (!res.items.length || page >= pages) break
  }
  return { items, total, truncated: items.length < total }
}

// The shared role catalog: every role the actor may read (GET /roles/ is scope-filtered by the
// backend, so a delegated admin sees their organization's roles, not system-wide ones). Needs
// role:read; gate it with canAccess('roles').
export const rolesCatalogQuery = defineQueryOptions(() => ({
  key: [ROLES_ROOT, 'catalog'],
  query: ctx => fetchAllRolePages(page => `/roles/?page=${page}&limit=${ROLES_PAGE_SIZE}`, ctx?.signal),
  staleTime: 1000 * 60
}))

// Roles the backend accepts for a membership at this entity (GET /roles/entity/{id}): active,
// assignable at its type, system-wide, its organization's, or entity-local on the entity or an
// ancestor. Needs role:read_tree at the entity.
export const entityRolesQuery = defineQueryOptions((entityId: string) => ({
  key: [ROLES_ROOT, 'entity', entityId],
  query: ctx => fetchAllRolePages(page => `/roles/entity/${entityId}?page=${page}&limit=${ROLES_PAGE_SIZE}`, ctx?.signal),
  staleTime: 1000 * 60
}))

// The roles list's catalogue for the filters GET /roles has no parameter for (origin): every
// page, filtered and paged in the browser, loaded only while such a filter is on. Its own key,
// not rolesCatalogQuery's: that entry is shared with the role chips and pools, gated on the
// Roles section alone, and must keep a single `enabled` (ARCHITECTURE.md "One enabled per key").
export const rolesListCatalogQuery = defineQueryOptions(() => ({
  key: [ROLES_ROOT, 'list', 'catalog'],
  query: ctx => fetchAllRolePages(page => `/roles/?page=${page}&limit=${ROLES_PAGE_SIZE}`, ctx?.signal),
  staleTime: CATALOGUE_STALE_TIME
}))

export const roleDetailQuery = defineQueryOptions((roleId: string) => ({
  key: [ROLES_ROOT, 'detail', roleId],
  query: ctx => apiClient.get<Role>(`/roles/${roleId}`, { signal: ctx?.signal })
}))

export function useCreateRole() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (input: CreateRoleInput) => apiClient.post<Role>('/roles/', { body: input }),
    onSettled: () => invalidate('role')
  })
}

// What a role edit sends: the changed fields (PATCH) and the permission diff. The set is never
// re-sent: PATCH `permissions` replaces it and re-resolves every attached permission, so it
// fails while any of them is inactive, and it would overwrite another admin's concurrent change.
export type SaveRoleInput = {
  roleId: string
  patch: Omit<UpdateRoleInput, 'permissions'>
  add: string[]
  remove: string[]
  // Filled as each request succeeds: on a failure part-way the caller re-bases its form on the
  // role as saved, so a retry sends only what is still missing.
  progress?: { saved: Role | null }
}

// DELETE /roles/{id}/permissions (removals), then PATCH /roles/{id} (changed fields), then POST
// /roles/{id}/permissions (additions); permission bodies are the bare names. Removals go first:
// they never need delegation, and a PATCH that widens the role (activates it, widens its scope,
// turns on auto-assign, adds assignable types) is checked against the role's CURRENT set, so a
// permission the admin is removing must be gone before it. Additions go last: each must be active
// and held by the actor.
export function useSaveRole() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: async ({ roleId, patch, add, remove, progress }: SaveRoleInput) => {
      let saved: Role | null = null
      const record = (role: Role) => {
        saved = role
        if (progress) progress.saved = role
      }
      if (remove.length) record(await apiClient.delete<Role>(`/roles/${roleId}/permissions`, { body: remove }))
      if (Object.keys(patch).length) record(await apiClient.patch<Role>(`/roles/${roleId}`, { body: patch }))
      if (add.length) record(await apiClient.post<Role>(`/roles/${roleId}/permissions`, { body: add }))
      return saved
    },
    onSettled: () => invalidate('role')
  })
}

export function useDeleteRole() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (roleId: string) => apiClient.delete<undefined>(`/roles/${roleId}`),
    onSettled: () => invalidate('role')
  })
}
