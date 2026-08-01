import type {
  EntityTypeSuggestionsResponse,
  GetEntityTypeSuggestionsParams,
} from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export async function getEntityTypeSuggestions(
  params: GetEntityTypeSuggestionsParams = {},
  options: { signal?: AbortSignal } = {}
) {
  const searchParams = new URLSearchParams()

  if (params.parentId) {
    searchParams.set('parent_id', params.parentId)
  }

  if (params.entityClass) {
    searchParams.set('entity_class', params.entityClass)
  }

  const query = searchParams.toString()
  const path = query
    ? `/entities/type-suggestions?${query}`
    : '/entities/type-suggestions'

  return apiClient.get<EntityTypeSuggestionsResponse>(path, {
    signal: options.signal,
  })
}
