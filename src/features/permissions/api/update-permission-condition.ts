import type {
  PermissionCondition,
  UpdatePermissionConditionInput,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function updatePermissionCondition({
  permissionId,
  conditionId,
  ...input
}: UpdatePermissionConditionInput) {
  return apiClient.patch<PermissionCondition>(
    `/permissions/${permissionId}/conditions/${conditionId}`,
    {
      body: input,
    }
  )
}
