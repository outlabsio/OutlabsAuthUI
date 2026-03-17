import type { RoleCondition } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function getRoleConditions(roleId: string) {
  return apiClient.get<RoleCondition[]>(`/roles/${roleId}/conditions`)
}
