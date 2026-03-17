import type {
  CreateRoleConditionGroupInput,
  RoleConditionGroup,
} from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function createRoleConditionGroup({
  roleId,
  ...input
}: CreateRoleConditionGroupInput) {
  return apiClient.post<RoleConditionGroup>(`/roles/${roleId}/condition-groups`, {
    body: input,
  })
}
