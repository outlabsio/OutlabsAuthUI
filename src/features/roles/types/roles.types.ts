import type { PaginatedResponse } from '@/lib/api/paginated-response.types'
import type {
  AbacCondition,
  AbacConditionGroup,
  AbacConditionValueType,
} from '@/features/abac/types/abac.types'

export type RoleScopeMode = 'entity_only' | 'hierarchy'
export type RoleType = 'global' | 'root' | 'entity'
export type RoleUsageFilter = 'all' | 'auto' | 'manual'
export type RoleSystemFilter = 'all' | 'system' | 'custom'
export type RoleTypeFilter = 'all' | RoleType
export type RoleScopeFilter = 'all' | RoleScopeMode

export type Role = {
  id: string
  name: string
  display_name: string
  description?: string | null
  permissions: string[]
  is_system_role: boolean
  is_global: boolean
  root_entity_id?: string | null
  root_entity_name?: string | null
  assignable_at_types: string[]
  scope_entity_id?: string | null
  scope_entity_name?: string | null
  scope: RoleScopeMode
  is_auto_assigned: boolean
}

export type GetRolesParams = {
  page?: number
  limit?: number
  search?: string
  isGlobal?: boolean
  rootEntityId?: string
}

export type RolesListResponse = PaginatedResponse<Role>

export type RolesPageSearch = {
  search?: string
  roleType?: RoleTypeFilter
  scopeMode?: RoleScopeFilter
  scopeRootId?: string
  assignableType?: string
  usage?: RoleUsageFilter
  system?: RoleSystemFilter
}

export type CreateRoleInput = {
  name: string
  display_name: string
  description?: string
  permissions: string[]
  is_global: boolean
  root_entity_id?: string
  scope_entity_id?: string
  scope: RoleScopeMode
  is_auto_assigned: boolean
  assignable_at_types: string[]
}

export type UpdateRoleInput = {
  roleId: string
  display_name?: string
  description?: string
  permissions?: string[]
  is_global?: boolean
  scope?: RoleScopeMode
  is_auto_assigned?: boolean
  assignable_at_types?: string[]
}

export type DeleteRoleInput = {
  roleId: string
}

export type RoleConditionGroup = AbacConditionGroup

export type RoleCondition = AbacCondition

export type CreateRoleConditionGroupInput = {
  roleId: string
  operator: 'AND' | 'OR'
  description?: string
}

export type UpdateRoleConditionGroupInput = {
  roleId: string
  groupId: string
  operator?: 'AND' | 'OR'
  description?: string
}

export type DeleteRoleConditionGroupInput = {
  roleId: string
  groupId: string
}

export type CreateRoleConditionInput = {
  roleId: string
  attribute: string
  operator: string
  value?: string | number | boolean | string[] | null
  value_type: AbacConditionValueType
  description?: string
  condition_group_id?: string | null
}

export type UpdateRoleConditionInput = {
  roleId: string
  conditionId: string
  attribute?: string
  operator?: string
  value?: string | number | boolean | string[] | null
  value_type?: AbacConditionValueType
  description?: string
  condition_group_id?: string | null
}

export type DeleteRoleConditionInput = {
  roleId: string
  conditionId: string
}
