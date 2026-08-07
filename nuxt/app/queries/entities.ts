import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type { CreateEntityInput, EntitiesListFilters, EntitiesListResponse, Entity, UpdateEntityInput } from '~/types/entity'

// Entities vertical. Read: list + detail. Write: create (POST /entities/), move
// (POST /entities/{id}/move), update (PATCH /entities/{id}). Mutations invalidate the
// resource root ['entities'] on settle. Advanced child-governance is a later pass.

// Key factory — single source of truth for this domain's cache keys (queries key off it,
// mutations invalidate entityKeys.root).
export const entityKeys = {
  root: ['entities'] as const,
  list: (filters: EntitiesListFilters) => [...entityKeys.root, 'list', filters] as const,
  detail: (entityId: string) => [...entityKeys.root, 'detail', entityId] as const
}

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
  key: entityKeys.list(filters),
  query: ctx =>
    apiClient.get<EntitiesListResponse>(`/entities/?${buildEntitiesQueryString(filters)}`, { signal: ctx?.signal })
}))

export const entityDetailQuery = defineQueryOptions((entityId: string) => ({
  key: entityKeys.detail(entityId),
  query: ctx => apiClient.get<Entity>(`/entities/${entityId}`, { signal: ctx?.signal })
}))

export function useCreateEntity() {
  const queryCache = useQueryCache()
  return useMutation({
    // Trailing slash: POST /entities 307-redirects and can drop the body.
    mutation: (input: CreateEntityInput) => apiClient.post<Entity>('/entities/', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: entityKeys.root })
  })
}

export function useUpdateEntity() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ entityId, input }: { entityId: string, input: UpdateEntityInput }) =>
      apiClient.patch<Entity>(`/entities/${entityId}`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: entityKeys.root })
  })
}

export function useMoveEntity() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ entityId, newParentId }: { entityId: string, newParentId: string | null }) =>
      apiClient.post<Entity>(`/entities/${entityId}/move`, { body: { new_parent_id: newParentId } }),
    onSettled: () => queryCache.invalidateQueries({ key: entityKeys.root })
  })
}
