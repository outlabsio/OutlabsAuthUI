import type { GetRolesParams, RolesListResponse } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

const defaultRolesParams: Required<Pick<GetRolesParams, 'page' | 'limit'>> = {
  page: 1,
  limit: 100,
}

export async function getRoles(params: GetRolesParams = {}) {
  const resolvedParams = {
    ...defaultRolesParams,
    ...params,
  }

  const searchParams = new URLSearchParams({
    page: String(resolvedParams.page),
    limit: String(resolvedParams.limit),
  })

  if (resolvedParams.search) {
    searchParams.set('search', resolvedParams.search)
  }

  if (typeof resolvedParams.isGlobal === 'boolean') {
    searchParams.set('is_global', String(resolvedParams.isGlobal))
  }

  if (resolvedParams.rootEntityId) {
    searchParams.set('root_entity_id', resolvedParams.rootEntityId)
  }

  return apiClient.get<RolesListResponse>(`/roles/?${searchParams.toString()}`)
}
