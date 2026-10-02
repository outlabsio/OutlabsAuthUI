import type { PaginatedResponse } from '~/types/auth'
import type { Narrow, ResponseBody, Schemas } from '~/types/wire'

// Entities. Response shapes derive from the generated wire types (types/wire.ts); the API types
// entity_class and status as plain strings, so the console narrows them to the values it handles.

export type EntityClassValue = 'structural' | 'access_group'
export type EntityStatusValue = 'active' | 'inactive' | 'archived'

export type Entity = Narrow<ResponseBody<Schemas['EntityResponse']>, {
  entity_class: EntityClassValue
  status: EntityStatusValue
  // Child governance — what may be created directly under this entity ([] = any).
  allowed_child_classes: EntityClassValue[]
}>

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

// GET /entities/type-suggestions: types already used beside the new entity.
export type EntityTypeSuggestions = ResponseBody<Schemas['EntityTypeSuggestionsResponse']>

// The statuses an admin sets directly. 'archived' is never written by PATCH: archiving is
// DELETE /entities/{id}, which also revokes what the entity grants (F-004).
export type EditableEntityStatus = 'active' | 'inactive'

// Create payload (POST /entities/). Omitting parent_entity_id creates a root. Root naming rules
// (child_*_pattern, child_naming_guidance) are accepted on roots only.
export type CreateEntityInput = {
  name: string
  display_name: string
  slug: string
  description?: string
  entity_class: EntityClassValue
  entity_type: string
  parent_entity_id?: string
  status?: EditableEntityStatus
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
  max_members?: number | null
  child_name_pattern?: string | null
  child_display_name_pattern?: string | null
  child_slug_pattern?: string | null
  child_naming_guidance?: string | null
  valid_from?: string | null
  valid_until?: string | null
}

// Update payload (PATCH /entities/{id}). entity_type is not editable post-create.
export type UpdateEntityInput = {
  display_name?: string
  description?: string | null
  status?: EditableEntityStatus
  allowed_child_classes?: EntityClassValue[]
  allowed_child_types?: string[]
  max_members?: number | null
  child_name_pattern?: string | null
  child_display_name_pattern?: string | null
  child_slug_pattern?: string | null
  child_naming_guidance?: string | null
  valid_from?: string | null
  valid_until?: string | null
}
