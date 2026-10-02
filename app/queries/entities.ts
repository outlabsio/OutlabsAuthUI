import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { CATALOGUE_STALE_TIME } from '~/queries/freshness'
import { useInvalidateAfter } from '~/queries/invalidation'
import type { CreateEntityInput, EntitiesListFilters, EntitiesListResponse, Entity, EntityClassValue, EntityTypeSuggestions, UpdateEntityInput } from '~/types/entity'

// Entities vertical. Read: list, detail, path, subtree, type suggestions. Write: create
// (POST /entities/), move (POST /entities/{id}/move), update (PATCH /entities/{id}) and archive
// (DELETE /entities/{id}). Mutations invalidate the entities root and the views that show entity
// names (invalidateAfter('entity')); archive also the memberships, keys and service accounts it
// revokes (invalidateAfter('entityArchive')).

// Key factory — single source of truth for this domain's cache keys (queries key off it,
// mutations invalidate entityKeys.root).
export const entityKeys = {
  root: ['entities'] as const,
  list: (filters: EntitiesListFilters) => [...entityKeys.root, 'list', filters] as const,
  detail: (entityId: string) => [...entityKeys.root, 'detail', entityId] as const,
  path: (entityId: string) => [...entityKeys.root, 'path', entityId] as const,
  descendants: (entityId: string) => [...entityKeys.root, 'descendants', entityId] as const,
  organisation: (rootId: string) => [...entityKeys.root, 'organisation', rootId] as const,
  paths: (entityIds: readonly string[]) => [...entityKeys.root, 'paths', [...entityIds].sort()] as const,
  typeSuggestions: (parentId: string | null, entityClass: EntityClassValue) => [...entityKeys.root, 'type-suggestions', parentId ?? 'root', entityClass] as const
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
    apiClient.get<EntitiesListResponse>(`/entities/?${buildEntitiesQueryString(filters)}`, { signal: ctx?.signal }),
  // The full tree (limit 1000) backs pickers and name lookups; every entity write invalidates it.
  ...((filters.limit ?? 0) >= 1000 && !filters.search ? { staleTime: CATALOGUE_STALE_TIME } : {})
}))

export const entityDetailQuery = defineQueryOptions((entityId: string) => ({
  key: entityKeys.detail(entityId),
  query: ctx => apiClient.get<Entity>(`/entities/${entityId}`, { signal: ctx?.signal })
}))

// Root-to-entity path (GET /entities/{id}/path, entity:read): the target's type, its root
// organization and its ancestors, which decide the roles a membership there may carry.
export const entityPathQuery = defineQueryOptions((entityId: string) => ({
  key: entityKeys.path(entityId),
  query: ctx => apiClient.get<Entity[]>(`/entities/${entityId}/path`, { signal: ctx?.signal })
}))

// Every entity beneath `entityId` (all depths, all statuses; not paginated by the API). With
// the root itself this is the complete subtree a scoped picker offers.
export const entityDescendantsQuery = defineQueryOptions((entityId: string) => ({
  key: entityKeys.descendants(entityId),
  query: ctx => apiClient.get<Entity[]>(`/entities/${entityId}/descendants`, { signal: ctx?.signal })
}))

// A whole organisation in one entry: the root first, then every entity beneath it (GET
// /entities/{root} + /descendants). Its own key, so the pickers and the command palette can gate
// it on their own state without touching the options of the tree's detail and descendants
// entries (one `enabled` per key, ARCHITECTURE.md). Backs the delegated admin's scoped lists.
export const entityOrganisationQuery = defineQueryOptions((rootId: string) => ({
  key: entityKeys.organisation(rootId),
  staleTime: CATALOGUE_STALE_TIME,
  query: async (ctx) => {
    const [root, descendants] = await Promise.all([
      apiClient.get<Entity>(`/entities/${rootId}`, { signal: ctx?.signal }),
      apiClient.get<Entity[]>(`/entities/${rootId}/descendants`, { signal: ctx?.signal })
    ])
    return [root, ...descendants]
  }
}))

// Root-to-entity chains for a handful of entities (server-search results whose ancestors are
// not loaded), keyed by entity id. Bounded by the caller: one request per id.
export const entityPathsQuery = defineQueryOptions((entityIds: readonly string[]) => ({
  key: entityKeys.paths(entityIds),
  staleTime: 60_000,
  query: async (ctx) => {
    const chains = await Promise.all(entityIds.map(id => apiClient.get<Entity[]>(`/entities/${id}/path`, { signal: ctx?.signal })))
    return Object.fromEntries(entityIds.map((id, i) => [id, chains[i] ?? []])) as Record<string, Entity[]>
  }
}))

// Types already used under a parent (or among roots), for the create dialog's Type field.
// Needs entity:create at the parent (entity:create_tree) — the same gate as creating there.
export const entityTypeSuggestionsQuery = defineQueryOptions(({ parentId, entityClass }: { parentId: string | null, entityClass: EntityClassValue }) => ({
  key: entityKeys.typeSuggestions(parentId, entityClass),
  staleTime: 60_000,
  query: (ctx) => {
    const params = new URLSearchParams({ entity_class: entityClass })
    if (parentId) params.set('parent_id', parentId)
    return apiClient.get<EntityTypeSuggestions>(`/entities/type-suggestions?${params.toString()}`, { signal: ctx?.signal })
  }
}))

export function useCreateEntity() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    // Trailing slash: POST /entities 307-redirects and can drop the body.
    mutation: (input: CreateEntityInput) => apiClient.post<Entity>('/entities/', { body: input }),
    onSettled: () => invalidate('entity')
  })
}

export function useUpdateEntity() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ entityId, input }: { entityId: string, input: UpdateEntityInput }) =>
      apiClient.patch<Entity>(`/entities/${entityId}`, { body: input }),
    onSettled: () => invalidate('entity')
  })
}

export function useMoveEntity() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ entityId, newParentId }: { entityId: string, newParentId: string | null }) =>
      apiClient.post<Entity>(`/entities/${entityId}/move`, { body: { new_parent_id: newParentId } }),
    onSettled: () => invalidate('entity')
  })
}

// Archive (DELETE /entities/{id}): the server sets the status to archived, archives the entity's
// memberships, revokes entity-scoped role assignments and API keys, archives its service
// accounts and removes it from the hierarchy. With active children it refuses unless `cascade`,
// which archives the active descendants the same way. There is no restore.
export function useArchiveEntity() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ entityId, cascade }: { entityId: string, cascade: boolean }) =>
      apiClient.delete<undefined>(`/entities/${entityId}?cascade=${cascade ? 'true' : 'false'}`),
    onSettled: () => invalidate('entityArchive')
  })
}
