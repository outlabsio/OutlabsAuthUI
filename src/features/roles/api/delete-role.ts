import type { DeleteRoleInput } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function deleteRole({ roleId }: DeleteRoleInput) {
  return apiClient.delete<void>(`/roles/${roleId}`)
}
