import type { Permission } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function getPermission(permissionId: string) {
  return apiClient.get<Permission>(`/permissions/${permissionId}`)
}
