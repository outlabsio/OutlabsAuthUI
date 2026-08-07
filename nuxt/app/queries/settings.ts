import { defineQueryOptions } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type { EntityTypeConfig } from '~/types/settings'

// P2 settings vertical (read layer) — entity-type configuration. Only meaningful when the
// backend exposes entity_hierarchy. Superuser edit (a tag-list form) is a later pass.
export const entityTypeConfigQuery = defineQueryOptions({
  key: ['config', 'entity-types'],
  query: ctx => apiClient.get<EntityTypeConfig>('/config/entity-types', { signal: ctx?.signal })
})
