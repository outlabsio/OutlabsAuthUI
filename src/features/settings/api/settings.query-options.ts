import { queryOptions } from '@tanstack/react-query'

import { getEntityTypeConfig } from '@/features/settings/api/get-entity-type-config'
import { settingsKeys } from '@/features/settings/api/settings.keys'

export function getEntityTypeConfigQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.entityTypeConfig(),
    queryFn: getEntityTypeConfig,
  })
}
