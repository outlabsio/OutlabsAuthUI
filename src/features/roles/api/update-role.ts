import type { Role, UpdateRoleInput } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function updateRole({ roleId, ...input }: UpdateRoleInput) {
  return apiClient.patch<Role>(`/roles/${roleId}`, {
    body: input,
  })
}
