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
  child_name_pattern?: string | null
  child_display_name_pattern?: string | null
  child_slug_pattern?: string | null
  child_naming_guidance?: string | null
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
  child_name_pattern?: string | null
  child_display_name_pattern?: string | null
  child_slug_pattern?: string | null
  child_naming_guidance?: string | null
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
  child_name_pattern?: string | null
  child_display_name_pattern?: string | null
  child_slug_pattern?: string | null
  child_naming_guidance?: string | null
}

export type EntityRoleSummary = {
  id: string
  name: string
  display_name: string
}

export type EntityTypeSuggestion = {
  entity_type: string
  count: number
  examples: string[]
}

export type EntityTypeSuggestionParent = {
  id: string
  name: string
  display_name: string
  entity_type: string
  entity_class: EntityClassValue
}

export type EntityTypeSuggestionsResponse = {
  suggestions: EntityTypeSuggestion[]
  parent_entity?: EntityTypeSuggestionParent | null
  total_children: number
}

export type GetEntityTypeSuggestionsParams = {
  parentId?: string
  entityClass?: EntityClassValue
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
