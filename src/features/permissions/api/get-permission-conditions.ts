import type { PermissionCondition } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function getPermissionConditions(permissionId: string) {
  return apiClient.get<PermissionCondition[]>(`/permissions/${permissionId}/conditions`)
}
