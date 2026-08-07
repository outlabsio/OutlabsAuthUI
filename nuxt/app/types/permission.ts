import type { PaginatedResponse } from '~/types/auth'

// Ported from the React permissions feature (src/features/permissions/types).

export type PermissionDefinitionStatus = 'active' | 'inactive' | 'archived'

export type Permission = {
  id: string
  name: string
  display_name: string
  description?: string | null
  resource?: string | null
  action?: string | null
  scope?: string | null
  is_system: boolean
  status: PermissionDefinitionStatus
  is_active: boolean
  tags: string[]
  metadata: Record<string, unknown>
}

// A permission NAME (e.g. "user:read") enriched from the catalog for display. Always renderable —
// resource/action fall back to splitting the name when the catalog lacks the definition. Produced by
// usePermissionCatalog and consumed by the AppPermission*/AppRole* display kit.
export type ResolvedPermission = {
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

export type PermissionsListFilters = {
  page?: number
  limit?: number
  resource?: string
}

export type CreatePermissionInput = {
  name: string
  display_name: string
  description?: string
  tags?: string[]
}
