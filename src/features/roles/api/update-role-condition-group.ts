import type {
  RoleConditionGroup,
  UpdateRoleConditionGroupInput,
} from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function updateRoleConditionGroup({
  roleId,
  groupId,
  ...input
}: UpdateRoleConditionGroupInput) {
  return apiClient.patch<RoleConditionGroup>(
    `/roles/${roleId}/condition-groups/${groupId}`,
    {
      body: input,
    }
  )
}
