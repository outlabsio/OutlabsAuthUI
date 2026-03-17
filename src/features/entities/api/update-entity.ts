import type {
  Entity,
  UpdateEntityInput,
} from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export function updateEntity({ entityId, ...input }: UpdateEntityInput) {
  return apiClient.patch<Entity>(`/entities/${entityId}`, {
    body: input,
  })
}
