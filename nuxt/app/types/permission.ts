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
