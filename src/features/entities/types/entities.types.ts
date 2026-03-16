import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type Entity = {
  id: string
  name: string
  display_name: string
  slug: string
  description?: string | null
  entity_class: string
  entity_type: string
  parent_entity_id?: string | null
  status: string
  valid_from?: string | null
  valid_until?: string | null
  direct_permissions?: string[]
  metadata?: Record<string, unknown>
  allowed_child_classes?: string[]
  allowed_child_types?: string[]
  max_members?: number | null
}

export type GetEntitiesParams = {
  page?: number
  limit?: number
}

export type EntitiesListResponse = PaginatedResponse<Entity>
