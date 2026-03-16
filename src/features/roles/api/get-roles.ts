import type {
  GetRolesParams,
  RolesListResponse,
} from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

const defaultRolesParams: Required<GetRolesParams> = {
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

  return apiClient.get<RolesListResponse>(`/roles/?${searchParams.toString()}`)
}
