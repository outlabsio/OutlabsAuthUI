import type { UserPermissionSource } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUserPermissions(
  userId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiClient.get<UserPermissionSource[]>(`/users/${userId}/permissions`, {
    signal: options.signal,
  })
}
