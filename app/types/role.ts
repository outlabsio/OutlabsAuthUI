import type { PaginatedResponse } from '~/types/auth'
import type { ResponseBody, Schemas } from '~/types/wire'

// Roles. Response shapes derive from the generated wire types (types/wire.ts).

export type RoleScopeMode = Schemas['RoleScopeEnum']
export type RoleDefinitionStatus = Schemas['DefinitionStatus']

export type Role = ResponseBody<Schemas['RoleResponse']>

export type RolesListResponse = PaginatedResponse<Role>

// Any role reference a payload carries: an id, optionally its names and permissions (a
// RoleSummary, a membership's role id, a history event's role_ids + role_names).
export type RoleReference = {
  id: string
  display_name?: string | null
  name?: string | null
  permissions?: string[] | null
  // True while the caller's own source of a name (a membership's history) is still loading, so
  // the role reads as loading rather than "Unknown role" until it answers.
  namePending?: boolean
}

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
