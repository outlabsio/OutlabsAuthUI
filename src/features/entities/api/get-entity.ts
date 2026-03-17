import type { Entity } from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export function getEntity(entityId: string) {
  return apiClient.get<Entity>(`/entities/${entityId}`)
}
