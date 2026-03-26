import type {
  CreateApiKeyInput,
  CreateApiKeyResponse,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function createApiKey(input: CreateApiKeyInput) {
  const { entityId, ...body } = input

  return apiClient.post<CreateApiKeyResponse>(`/admin/entities/${entityId}/api-keys`, {
    body,
  })
}
