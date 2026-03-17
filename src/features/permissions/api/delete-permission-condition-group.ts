import type { DeletePermissionConditionGroupInput } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function deletePermissionConditionGroup({
  permissionId,
  groupId,
}: DeletePermissionConditionGroupInput) {
  return apiClient.delete(`/permissions/${permissionId}/condition-groups/${groupId}`)
}
