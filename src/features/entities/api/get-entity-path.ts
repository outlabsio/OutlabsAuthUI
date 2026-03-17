import type { Entity } from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export function getEntityPath(entityId: string) {
  return apiClient.get<Entity[]>(`/entities/${entityId}/path`)
}
