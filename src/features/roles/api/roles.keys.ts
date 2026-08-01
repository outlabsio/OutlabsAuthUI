import type { GetRolesParams } from '@/features/roles/types/roles.types'

export const rolesKeys = {
  all: ['roles'] as const,
  lists: () => [...rolesKeys.all, 'list'] as const,
  list: (params: GetRolesParams) => [...rolesKeys.lists(), params] as const,
  infiniteLists: () => [...rolesKeys.all, 'infinite-list'] as const,
  infiniteList: (params: Omit<GetRolesParams, 'page'>) =>
    [...rolesKeys.infiniteLists(), params] as const,
  details: () => [...rolesKeys.all, 'detail'] as const,
  detail: (roleId: string) => [...rolesKeys.details(), roleId] as const,
  conditionGroups: (roleId: string) =>
    [...rolesKeys.detail(roleId), 'condition-groups'] as const,
  conditions: (roleId: string) => [...rolesKeys.detail(roleId), 'conditions'] as const,
  entityLists: () => [...rolesKeys.all, 'entity-list'] as const,
  entityList: (entityId: string, params: GetRolesParams) =>
    [...rolesKeys.entityLists(), entityId, params] as const,
  create: () => [...rolesKeys.all, 'create'] as const,
  update: () => [...rolesKeys.all, 'update'] as const,
  remove: () => [...rolesKeys.all, 'remove'] as const,
}
