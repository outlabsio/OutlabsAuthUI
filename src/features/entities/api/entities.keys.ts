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
    [...entitiesKeys.all, 'descendants', entityId] as const,
  path: (entityId: string) => [...entitiesKeys.all, 'path', entityId] as const,
  typeSuggestions: (params: GetEntityTypeSuggestionsParams) =>
    [...entitiesKeys.all, 'type-suggestions', params] as const,
  memberLists: () => [...entitiesKeys.all, 'members'] as const,
  memberList: (entityId: string, params: GetEntityMembersParams) =>
    [...entitiesKeys.memberLists(), entityId, params] as const,
}
