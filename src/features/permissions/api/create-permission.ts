import type {
  CreatePermissionInput,
  Permission,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function createPermission(input: CreatePermissionInput) {
  return apiClient.post<Permission>('/permissions/', {
    body: input,
  })
}
