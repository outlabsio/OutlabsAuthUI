import type {
  CheckPermissionsInput,
  CheckPermissionsResponse,
} from '@/features/permissions/types/permissions.types'
import { apiClient } from '@/lib/api/client'

export function checkPermissions(input: CheckPermissionsInput) {
  return apiClient.post<CheckPermissionsResponse>('/permissions/check', {
    body: {
      user_id: input.userId,
      permissions: input.permissions,
      ...(input.entityId ? { entity_id: input.entityId } : {}),
    },
  })
}
