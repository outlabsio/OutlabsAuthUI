import type { EntityTypeConfig } from '@/features/settings/types/settings.types'
import { apiClient } from '@/lib/api/client'

export function getEntityTypeConfig(options: { signal?: AbortSignal } = {}) {
  return apiClient.get<EntityTypeConfig>('/config/entity-types', {
    auth: false,
    signal: options.signal,
  })
}
