import type { Entity } from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export function getEntityDescendants(
  entityId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<Entity[]>(`/entities/${entityId}/descendants`, {
    signal: options.signal,
  })
}
