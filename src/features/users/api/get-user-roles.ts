import type { Role } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function getUserRoles(userId: string) {
  return apiClient.get<Role[]>(`/users/${userId}/roles`)
}
