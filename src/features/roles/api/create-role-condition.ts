import type {
  CreateRoleConditionInput,
  RoleCondition,
} from '@/features/roles/types/roles.types'
import { apiClient } from '@/lib/api/client'

export function createRoleCondition({ roleId, ...input }: CreateRoleConditionInput) {
  return apiClient.post<RoleCondition>(`/roles/${roleId}/conditions`, {
    body: input,
  })
}
