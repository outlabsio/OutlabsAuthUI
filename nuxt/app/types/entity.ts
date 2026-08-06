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

// Create payload (POST /entities/). Omitting parent_entity_id creates a root. The advanced
// child-governance fields (allowed_child_*, patterns, validity window) are a later pass.
export type CreateEntityInput = {
  name: string
  display_name: string
  slug: string
  description?: string
  entity_class: EntityClassValue
  entity_type: string
  parent_entity_id?: string
}

// Update payload (PATCH /entities/{id}). entity_type is not editable post-create.
export type UpdateEntityInput = {
  display_name?: string
  description?: string | null
  status?: EntityStatusValue
}
