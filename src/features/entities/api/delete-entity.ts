import { apiClient } from '@/lib/api/client'

export type DeleteEntityInput = {
  entityId: string
  cascade?: boolean
}

export function deleteEntity({ entityId, cascade = false }: DeleteEntityInput) {
  const query = cascade ? '?cascade=true' : ''

  return apiClient.delete<void>(`/entities/${entityId}${query}`)
}
