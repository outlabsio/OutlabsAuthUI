import { queryOptions } from '@tanstack/react-query'

import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { getEntities } from '@/features/entities/api/get-entities'
import type { GetEntitiesParams } from '@/features/entities/types/entities.types'

export function getEntitiesQueryOptions(params: GetEntitiesParams = {}) {
  return queryOptions({
    queryKey: entitiesKeys.list(params),
    queryFn: () => getEntities(params),
  })
}
