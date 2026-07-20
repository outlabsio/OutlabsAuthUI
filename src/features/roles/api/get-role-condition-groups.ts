import type { RoleConditionGroup } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function getRoleConditionGroups(
  roleId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<RoleConditionGroup[]>(`/roles/${roleId}/condition-groups`, {
    signal: options.signal,
  })
}
