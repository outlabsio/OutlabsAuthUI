import type { RoleCondition } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function getRoleConditions(
  roleId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<RoleCondition[]>(`/roles/${roleId}/conditions`, {
    signal: options.signal,
  })
}
