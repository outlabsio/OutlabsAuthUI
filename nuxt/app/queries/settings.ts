import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type { EntityTypeConfig, EntityTypeConfigUpdate } from '~/types/settings'

// P2 settings vertical — entity-type configuration. Only meaningful when the backend exposes
// entity_hierarchy. Read via GET; superuser edit via PUT.
const CONFIG_KEY = ['config', 'entity-types'] as const

export const entityTypeConfigQuery = defineQueryOptions({
  key: CONFIG_KEY,
  query: ctx => apiClient.get<EntityTypeConfig>('/config/entity-types', { signal: ctx?.signal })
})

export function useUpdateEntityTypeConfig() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: EntityTypeConfigUpdate) => apiClient.put<EntityTypeConfig>('/config/entity-types', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: CONFIG_KEY })
  })
}
