import type { Permission } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function getPermission(
  permissionId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<Permission>(`/permissions/${permissionId}`, {
    signal: options.signal,
  })
}
