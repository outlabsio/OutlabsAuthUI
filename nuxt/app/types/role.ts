import type { PaginatedResponse } from '~/types/auth'

// Ported from the React roles feature (src/features/roles/types).

export type RoleScopeMode = 'entity_only' | 'hierarchy'
export type RoleDefinitionStatus = 'active' | 'inactive' | 'archived'

export type Role = {
  id: string
  name: string
  display_name: string
  description?: string | null
  permissions: string[]
  is_system_role: boolean
  is_global: boolean
  status: RoleDefinitionStatus
  root_entity_id?: string | null
  root_entity_name?: string | null
  assignable_at_types: string[]
  scope_entity_id?: string | null
  scope_entity_name?: string | null
  scope: RoleScopeMode
  is_auto_assigned: boolean
}

export type RolesListResponse = PaginatedResponse<Role>

export type RolesListFilters = {
  page?: number
  limit?: number
  search?: string
  isGlobal?: boolean
  rootEntityId?: string
}

// UI concept over the backend fields: global (system-wide) / root (owned by an org) / entity
// (defined at a specific entity). Maps to is_global + root_entity_id + scope_entity_id on submit.
export type RoleType = 'global' | 'root' | 'entity'

export type CreateRoleInput = {
  name: string
  display_name: string
  description?: string
  permissions: string[]
  is_global: boolean
  status?: RoleDefinitionStatus
  root_entity_id?: string | null
  scope_entity_id?: string | null
  scope?: RoleScopeMode
  is_auto_assigned?: boolean
  assignable_at_types?: string[]
}

// root_entity_id / scope_entity_id are set at creation and not editable.
export type UpdateRoleInput = {
  display_name?: string
  description?: string
  permissions?: string[]
  status?: RoleDefinitionStatus
  scope?: RoleScopeMode
  is_auto_assigned?: boolean
  assignable_at_types?: string[]
}
