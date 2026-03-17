import type { DeleteRoleConditionInput } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function deleteRoleCondition({
  roleId,
  conditionId,
}: DeleteRoleConditionInput) {
  return apiClient.delete<void>(`/roles/${roleId}/conditions/${conditionId}`)
}
