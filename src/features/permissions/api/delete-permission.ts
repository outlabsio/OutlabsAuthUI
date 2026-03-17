import type { DeletePermissionInput } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function deletePermission({ permissionId }: DeletePermissionInput) {
  return apiClient.delete(`/permissions/${permissionId}`)
}
