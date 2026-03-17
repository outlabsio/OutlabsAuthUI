import type {
  GetPermissionsParams,
  PermissionsListResponse,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function getPermissions({
  page = 1,
  limit = 1000,
  resource,
}: GetPermissionsParams = {}) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (resource) {
    searchParams.set('resource', resource)
  }

  return apiClient.get<PermissionsListResponse>(`/permissions/?${searchParams.toString()}`)
}
