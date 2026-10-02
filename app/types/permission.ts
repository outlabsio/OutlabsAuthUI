import type { PaginatedResponse } from '~/types/auth'
import type { Narrow, RequestBody, ResponseBody, Schemas } from '~/types/wire'

// Permissions. Response shapes derive from the generated wire types (types/wire.ts).

export type PermissionDefinitionStatus = Schemas['DefinitionStatus']

export type Permission = ResponseBody<Schemas['PermissionResponse']>

// A permission NAME (e.g. "user:read") enriched from the catalog for display. Always renderable —
// resource/action fall back to splitting the name when the catalog lacks the definition. Produced by
// usePermissionCatalog and consumed by the AppPermission*/AppRole* display kit.
export type ResolvedPermission = {
  // The catalog entry's id, when the catalog is readable and has the name.
  id?: string
  name: string
  displayName: string
  resource: string
  action: string
  description?: string | null
}

export type PermissionGroup = {
  resource: string
  items: ResolvedPermission[]
}

export type PermissionsListResponse = PaginatedResponse<Permission>

// The permissions list's origin filter (client-side: the API has no is_system parameter).
export type PermissionOriginFilter = 'all' | 'system' | 'custom'

export type PermissionsListFilters = {
  page?: number
  limit?: number
  resource?: string
}

export type CreatePermissionInput = Pick<
  RequestBody<Schemas['PermissionCreateRequest'], 'name' | 'display_name'>,
  'name' | 'display_name' | 'description' | 'tags' | 'is_active'
>

// PATCH /permissions/{id}: the editable fields (metadata is dropped by the router, so not sent).
export type UpdatePermissionInput = Pick<
  RequestBody<Schemas['PermissionUpdateRequest']>,
  'display_name' | 'description' | 'tags' | 'is_active'
>

// GET /users/{id}/permissions: each permission the account's grants in force give it, listed once
// with the first role found to grant it (the API deduplicates by name; `source_name` is the
// role's system name). RBAC only: ABAC conditions are not evaluated.
export type UserPermissionSource = ResponseBody<Schemas['UserPermissionSource']>

// POST /permissions/check (permission:check): does the account hold each permission, globally or
// inside one entity (tree permissions inherited from ancestors count there).
export type PermissionCheckInput = RequestBody<Schemas['PermissionCheckRequest'], 'user_id' | 'permissions'>
export type PermissionCheckResponse = Narrow<ResponseBody<Schemas['PermissionCheckResponse']>, { results: Record<string, boolean> }>
