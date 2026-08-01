import type {
  EntityTypeConfig,
  UpdateEntityTypeConfigInput,
} from '@/features/settings/types/settings.types'
import { apiClient } from '@/lib/api/client'

export function updateEntityTypeConfig(input: UpdateEntityTypeConfigInput) {
  return apiClient.put<EntityTypeConfig>('/config/entity-types', {
    body: input,
  })
}
