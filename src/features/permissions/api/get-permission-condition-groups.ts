import type { PermissionConditionGroup } from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function getPermissionConditionGroups(
  permissionId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<PermissionConditionGroup[]>(
    `/permissions/${permissionId}/condition-groups`,
    { signal: options.signal }
  )
}
