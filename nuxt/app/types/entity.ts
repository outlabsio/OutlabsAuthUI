import type { PaginatedResponse } from '~/types/auth'

// Ported from the React entities feature (src/features/entities/types).

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
}

export type EntitiesListResponse = PaginatedResponse<Entity>

export type EntitiesListFilters = {
  page?: number
  limit?: number
  search?: string
  entityClass?: EntityClassValue
  entityType?: string
  parentId?: string
  rootOnly?: boolean
}
