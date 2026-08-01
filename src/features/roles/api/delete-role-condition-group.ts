import type { DeleteRoleConditionGroupInput } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function deleteRoleConditionGroup({
  roleId,
  groupId,
}: DeleteRoleConditionGroupInput) {
  return apiClient.delete<void>(`/roles/${roleId}/condition-groups/${groupId}`)
}
