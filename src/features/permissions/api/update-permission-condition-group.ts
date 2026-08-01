import type {
  PermissionConditionGroup,
  UpdatePermissionConditionGroupInput,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function updatePermissionConditionGroup({
  permissionId,
  groupId,
  ...input
}: UpdatePermissionConditionGroupInput) {
  return apiClient.patch<PermissionConditionGroup>(
    `/permissions/${permissionId}/condition-groups/${groupId}`,
    {
      body: input,
    }
  )
}
