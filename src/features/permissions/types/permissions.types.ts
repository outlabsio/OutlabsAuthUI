import type { PaginatedResponse } from '@/lib/api/paginated-response.types'
import type {
  AbacCondition,
  AbacConditionGroup,
} from '@/features/abac/types/abac.types'

export type PermissionSystemFilter = 'all' | 'system' | 'custom'
export type PermissionStatusFilter = 'all' | 'active' | 'inactive'
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

export type GetPermissionsParams = {
  page?: number
  limit?: number
  resource?: string
}

export type PermissionsListResponse = PaginatedResponse<Permission>

export type PermissionsPageSearch = {
  search?: string
  resource?: string
  system?: PermissionSystemFilter
  status?: PermissionStatusFilter
  tag?: string
}

export type CreatePermissionInput = {
  name: string
  display_name: string
  description?: string
  is_system?: boolean
  status?: Exclude<PermissionDefinitionStatus, 'archived'>
  tags?: string[]
}

export type UpdatePermissionInput = {
  permissionId: string
  display_name?: string
  description?: string
  status?: Exclude<PermissionDefinitionStatus, 'archived'>
  tags?: string[]
}

export type DeletePermissionInput = {
  permissionId: string
}

export type PermissionConditionGroup = AbacConditionGroup
export type PermissionCondition = AbacCondition

export type CreatePermissionConditionGroupInput = {
  permissionId: string
  operator: 'AND' | 'OR'
  description?: string
}

export type UpdatePermissionConditionGroupInput = {
  permissionId: string
  groupId: string
  operator?: 'AND' | 'OR'
  description?: string
}

export type DeletePermissionConditionGroupInput = {
  permissionId: string
  groupId: string
}

export type CreatePermissionConditionInput = {
  permissionId: string
  attribute: string
  operator: string
  value?: string | number | boolean | string[] | null
  value_type: AbacCondition['value_type']
  description?: string
  condition_group_id?: string | null
}

export type UpdatePermissionConditionInput = {
  permissionId: string
  conditionId: string
  attribute?: string
  operator?: string
  value?: string | number | boolean | string[] | null
  value_type?: AbacCondition['value_type']
  description?: string
  condition_group_id?: string | null
}

export type DeletePermissionConditionInput = {
  permissionId: string
  conditionId: string
}
