import type { GetRolesParams, RolesListResponse } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

const defaultRolesForEntityParams: Required<GetRolesParams> = {
  page: 1,
  limit: 100,
}

export async function getRolesForEntity(
  entityId: string,
  params: GetRolesParams = {}
) {
  const resolvedParams = {
    ...defaultRolesForEntityParams,
    ...params,
  }

  const searchParams = new URLSearchParams({
    page: String(resolvedParams.page),
    limit: String(resolvedParams.limit),
  })

  return apiClient.get<RolesListResponse>(
    `/roles/entity/${entityId}?${searchParams.toString()}`
  )
}
