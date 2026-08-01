import type {
  Permission,
  UpdatePermissionInput,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function updatePermission({
  permissionId,
  ...input
}: UpdatePermissionInput) {
  return apiClient.patch<Permission>(`/permissions/${permissionId}`, {
    body: input,
  })
}
