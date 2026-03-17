import { queryOptions } from '@tanstack/react-query'

import { getEntity } from '@/features/entities/api/get-entity'
import { getEntityDescendants } from '@/features/entities/api/get-entity-descendants'
import { getEntityMembers } from '@/features/entities/api/get-entity-members'
import { getEntityPath } from '@/features/entities/api/get-entity-path'
import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { getEntities } from '@/features/entities/api/get-entities'
import type {
  GetEntitiesParams,
  GetEntityMembersParams,
} from '@/features/entities/types/entities.types'

export function getEntitiesQueryOptions(params: GetEntitiesParams = {}) {
  return queryOptions({
    queryKey: entitiesKeys.list(params),
    queryFn: () => getEntities(params),
  })
}

export function getEntityQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: entitiesKeys.detail(entityId),
    queryFn: () => getEntity(entityId),
  })
}

export function getEntityDescendantsQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: entitiesKeys.descendants(entityId),
    queryFn: () => getEntityDescendants(entityId),
  })
}

export function getEntityPathQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: entitiesKeys.path(entityId),
    queryFn: () => getEntityPath(entityId),
  })
}

export function getEntityMembersQueryOptions(
  entityId: string,
  params: GetEntityMembersParams = {}
) {
  const resolvedParams = {
    page: params.page ?? 1,
    limit: params.limit ?? 50,
    includeInactive: params.includeInactive ?? false,
  }

  return queryOptions({
    queryKey: entitiesKeys.memberList(entityId, resolvedParams),
    queryFn: () => getEntityMembers(entityId, resolvedParams),
  })
}
