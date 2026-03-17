import type { PermissionsCatalogResponse } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function getPermissionsCatalog() {
  return apiClient.get<PermissionsCatalogResponse>('/permissions/?page=1&limit=1000')
}
