import type {
  CreatePermissionConditionInput,
  PermissionCondition,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function createPermissionCondition({
  permissionId,
  ...input
}: CreatePermissionConditionInput) {
  return apiClient.post<PermissionCondition>(`/permissions/${permissionId}/conditions`, {
    body: input,
  })
}
