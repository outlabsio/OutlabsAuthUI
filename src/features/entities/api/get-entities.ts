import type {
  EntitiesListResponse,
  GetEntitiesParams,
} from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

const defaultEntitiesParams: Required<GetEntitiesParams> = {
  page: 1,
  limit: 100,
}

export async function getEntities(params: GetEntitiesParams = {}) {
  const resolvedParams = {
    ...defaultEntitiesParams,
    ...params,
  }

  const searchParams = new URLSearchParams({
    page: String(resolvedParams.page),
    limit: String(resolvedParams.limit),
  })

  return apiClient.get<EntitiesListResponse>(`/entities/?${searchParams.toString()}`)
}
