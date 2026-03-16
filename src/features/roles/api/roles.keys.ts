import type { GetRolesParams } from '@/features/roles/types/roles.types'

export const rolesKeys = {
  all: ['roles'] as const,
  lists: () => [...rolesKeys.all, 'list'] as const,
  list: (params: GetRolesParams) => [...rolesKeys.lists(), params] as const,
  entityLists: () => [...rolesKeys.all, 'entity-list'] as const,
  entityList: (entityId: string, params: GetRolesParams) =>
    [...rolesKeys.entityLists(), entityId, params] as const,
}
