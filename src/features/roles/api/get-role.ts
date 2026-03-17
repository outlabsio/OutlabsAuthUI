import type { Role } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function getRole(roleId: string) {
  return apiClient.get<Role>(`/roles/${roleId}`)
}
