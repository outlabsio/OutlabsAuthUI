import type {
  CreatePermissionConditionGroupInput,
  PermissionConditionGroup,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function createPermissionConditionGroup({
  permissionId,
  ...input
}: CreatePermissionConditionGroupInput) {
  return apiClient.post<PermissionConditionGroup>(
    `/permissions/${permissionId}/condition-groups`,
    {
      body: input,
    }
  )
}
