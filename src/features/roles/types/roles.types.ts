import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type Role = {
  id: string
  name: string
  display_name: string
  description?: string | null
  permissions: string[]
  entity_type_permissions?: Record<string, string[]> | null
  is_system_role: boolean
  is_global: boolean
  root_entity_id?: string | null
  root_entity_name?: string | null
  assignable_at_types: string[]
  scope_entity_id?: string | null
  scope_entity_name?: string | null
  scope: string
  is_auto_assigned: boolean
}

export type GetRolesParams = {
  page?: number
  limit?: number
}

export type RolesListResponse = PaginatedResponse<Role>
