import type { EntityTypeConfig } from '@/features/settings/types/settings.types'
import { apiClient } from '@/lib/api/client'

export function getEntityTypeConfig() {
  return apiClient.get<EntityTypeConfig>('/config/entity-types', {
    auth: false,
  })
}
