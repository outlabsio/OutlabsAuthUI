import type { DeletePermissionConditionInput } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function deletePermissionCondition({
  permissionId,
  conditionId,
}: DeletePermissionConditionInput) {
  return apiClient.delete(`/permissions/${permissionId}/conditions/${conditionId}`)
}
