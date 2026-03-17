import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type EntityClassValue = 'structural' | 'access_group'
export type EntityStatusValue = 'active' | 'inactive' | 'archived'

export type Entity = {
  id: string
  name: string
  display_name: string
  slug: string
  description?: string | null
  entity_class: EntityClassValue
  entity_type: string
  parent_entity_id?: string | null
  status: EntityStatusValue
  valid_from?: string | null
  valid_until?: string | null
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
  max_members?: number | null
}

export type GetEntitiesParams = {
  page?: number
  limit?: number
  search?: string
  entityClass?: EntityClassValue
  entityType?: string
  parentId?: string
  rootOnly?: boolean
}

export type EntitiesListResponse = PaginatedResponse<Entity>

export type EntitiesPageSearch = {
  search?: string
  scopeRootId?: string
}

export type CreateEntityInput = {
  name: string
  display_name: string
  slug: string
  description?: string
  entity_class: EntityClassValue
  entity_type: string
  parent_entity_id?: string
  status?: EntityStatusValue
  valid_from?: string | null
  valid_until?: string | null
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
  max_members?: number | null
}

export type UpdateEntityInput = {
  entityId: string
  display_name?: string
  description?: string
  status?: EntityStatusValue
  valid_from?: string | null
  valid_until?: string | null
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
  max_members?: number | null
}

export type EntityRoleSummary = {
  id: string
  name: string
  display_name: string
}

export type EntityMember = {
  id: string
  user_id: string
  user_email: string
  user_first_name?: string | null
  user_last_name?: string | null
  user_status: string
  roles: EntityRoleSummary[]
  status: string
  effective_status: string
  joined_at: string
  valid_from?: string | null
  valid_until?: string | null
}

export type GetEntityMembersParams = {
  page?: number
  limit?: number
  includeInactive?: boolean
}
