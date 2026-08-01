import type { CreateRoleInput, Role } from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function createRole(input: CreateRoleInput) {
  return apiClient.post<Role>('/roles/', {
    body: input,
  })
}
