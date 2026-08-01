import type { EntitiesListResponse, GetEntitiesParams } from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export async function getEntities(
  params: GetEntitiesParams = {},
  options: { signal?: AbortSignal } = {}
) {
  const page = params.page ?? 1
  const limit = params.limit ?? 100

  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (params.search) {
    searchParams.set('search', params.search)
  }

  if (params.entityClass) {
    searchParams.set('entity_class', params.entityClass)
  }

  if (params.entityType) {
    searchParams.set('entity_type', params.entityType)
  }

  if (params.parentId) {
    searchParams.set('parent_id', params.parentId)
  }

  if (params.rootOnly) {
    searchParams.set('root_only', 'true')
  }

  return apiClient.get<EntitiesListResponse>(`/entities/?${searchParams.toString()}`, {
    signal: options.signal,
  })
}
