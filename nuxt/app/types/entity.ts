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
  // Child governance — constrains what may be created directly under this entity.
  allowed_child_classes?: EntityClassValue[] | null
  allowed_child_types?: string[] | null
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

// Create payload (POST /entities/). Omitting parent_entity_id creates a root. Naming patterns,
// validity windows and max_members remain a later pass.
export type CreateEntityInput = {
  name: string
  display_name: string
  slug: string
  description?: string
  entity_class: EntityClassValue
  entity_type: string
  parent_entity_id?: string
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
}

// Update payload (PATCH /entities/{id}). entity_type is not editable post-create.
export type UpdateEntityInput = {
  display_name?: string
  description?: string | null
  status?: EntityStatusValue
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
}
