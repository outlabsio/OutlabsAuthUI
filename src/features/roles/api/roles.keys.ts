import type { GetRolesParams } from '@/features/roles/types/roles.types'

export const rolesKeys = {
  all: ['roles'] as const,
  lists: () => [...rolesKeys.all, 'list'] as const,
  list: (params: GetRolesParams) => [...rolesKeys.lists(), params] as const,
}
