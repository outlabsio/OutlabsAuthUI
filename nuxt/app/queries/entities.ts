import { defineQueryOptions } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type { EntitiesListFilters, EntitiesListResponse, Entity } from '~/types/entity'

// P2 vertical (read layer) — the entity hierarchy. Create/move is hierarchy-constrained
// (parent + allowed child types) and lands in a later pass with a tree-aware form.

const ENTITIES_ROOT = 'entities' as const

function buildEntitiesQueryString(filters: EntitiesListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 100)
  })
  if (filters.search) params.set('search', filters.search)
  if (filters.entityClass) params.set('entity_class', filters.entityClass)
  if (filters.entityType) params.set('entity_type', filters.entityType)
  if (filters.parentId) params.set('parent_id', filters.parentId)
  if (filters.rootOnly) params.set('root_only', 'true')
  return params.toString()
}

export const entitiesListQuery = defineQueryOptions((filters: EntitiesListFilters) => ({
  key: [ENTITIES_ROOT, 'list', filters],
  query: ctx =>
    apiClient.get<EntitiesListResponse>(`/entities/?${buildEntitiesQueryString(filters)}`, { signal: ctx?.signal })
}))

export const entityDetailQuery = defineQueryOptions((entityId: string) => ({
  key: [ENTITIES_ROOT, 'detail', entityId],
  query: ctx => apiClient.get<Entity>(`/entities/${entityId}`, { signal: ctx?.signal })
}))
