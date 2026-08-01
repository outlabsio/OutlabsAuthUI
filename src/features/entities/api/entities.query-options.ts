import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { getEntity } from '@/features/entities/api/get-entity'
import { getEntityDescendants } from '@/features/entities/api/get-entity-descendants'
import { getEntityMembers } from '@/features/entities/api/get-entity-members'
import { getEntityPath } from '@/features/entities/api/get-entity-path'
import { getEntityTypeSuggestions } from '@/features/entities/api/get-entity-type-suggestions'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { getEntities } from '@/features/entities/api/get-entities'
import type {
  GetEntitiesParams,
  GetEntityMembersParams,
  GetEntityTypeSuggestionsParams,
} from '@/features/entities/types/entities.types'

export function getEntitiesQueryOptions(params: GetEntitiesParams = {}) {
  return queryOptions({
    queryKey: entitiesKeys.list(params),
    queryFn: ({ signal }) => getEntities(params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getEntityQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: entitiesKeys.detail(entityId),
    queryFn: ({ signal }) => getEntity(entityId, { signal }),
  })
}

export function getEntityDescendantsQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: entitiesKeys.descendants(entityId),
    queryFn: ({ signal }) => getEntityDescendants(entityId, { signal }),
  })
}

export function getEntityPathQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: entitiesKeys.path(entityId),
    queryFn: ({ signal }) => getEntityPath(entityId, { signal }),
  })
}

export function getEntityTypeSuggestionsQueryOptions(
  params: GetEntityTypeSuggestionsParams = {}
) {
  return queryOptions({
    queryKey: entitiesKeys.typeSuggestions(params),
    queryFn: ({ signal }) => getEntityTypeSuggestions(params, { signal }),
  })
}

export function getEntityMembersQueryOptions(
  entityId: string,
  params: GetEntityMembersParams = {}
) {
  const resolvedParams = {
    page: params.page ?? 1,
    limit: Math.min(params.limit ?? 50, 100),
    includeInactive: params.includeInactive ?? false,
  }

  return queryOptions({
    queryKey: entitiesKeys.memberList(entityId, resolvedParams),
    queryFn: ({ signal }) => getEntityMembers(entityId, resolvedParams, { signal }),
    placeholderData: keepPreviousData,
  })
}
