import type { GetEntitiesParams } from '@/features/entities/types/entities.types'

export const entitiesKeys = {
  all: ['entities'] as const,
  lists: () => [...entitiesKeys.all, 'list'] as const,
  list: (params: GetEntitiesParams) => [...entitiesKeys.lists(), params] as const,
}
