import type {
  GetEntitiesParams,
  GetEntityMembersParams,
  GetEntityTypeSuggestionsParams,
} from '@/features/entities/types/entities.types'

export const entitiesKeys = {
  all: ['entities'] as const,
  lists: () => [...entitiesKeys.all, 'list'] as const,
  list: (params: GetEntitiesParams) => [...entitiesKeys.lists(), params] as const,
  details: () => [...entitiesKeys.all, 'detail'] as const,
  detail: (entityId: string) => [...entitiesKeys.details(), entityId] as const,
  descendants: (entityId: string) =>
    [...entitiesKeys.detail(entityId), 'descendants'] as const,
  path: (entityId: string) => [...entitiesKeys.detail(entityId), 'path'] as const,
  members: (entityId: string) => [...entitiesKeys.detail(entityId), 'members'] as const,
  memberList: (entityId: string, params: GetEntityMembersParams) =>
    [...entitiesKeys.members(entityId), params] as const,
  typeSuggestions: (params: GetEntityTypeSuggestionsParams) =>
    [...entitiesKeys.all, 'type-suggestions', params] as const,
  create: () => [...entitiesKeys.all, 'create'] as const,
  update: () => [...entitiesKeys.all, 'update'] as const,
  remove: () => [...entitiesKeys.all, 'remove'] as const,
  move: () => [...entitiesKeys.all, 'move'] as const,
}
