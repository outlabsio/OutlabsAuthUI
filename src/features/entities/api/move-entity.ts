import type { Entity } from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export type MoveEntityInput = {
  entityId: string
  newParentId: string | null
}

export function moveEntity({ entityId, newParentId }: MoveEntityInput) {
  return apiClient.post<Entity>(`/entities/${entityId}/move`, {
    body: {
      new_parent_id: newParentId,
    },
  })
}
