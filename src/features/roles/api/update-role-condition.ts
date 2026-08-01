import type {
  RoleCondition,
  UpdateRoleConditionInput,
} from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function updateRoleCondition({
  roleId,
  conditionId,
  ...input
}: UpdateRoleConditionInput) {
  return apiClient.patch<RoleCondition>(`/roles/${roleId}/conditions/${conditionId}`, {
    body: input,
  })
}
