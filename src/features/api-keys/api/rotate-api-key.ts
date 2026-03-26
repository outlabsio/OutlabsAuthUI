import type {
  CreateApiKeyResponse,
  RotateApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function rotateApiKey({ entityId, keyId }: RotateApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>(
    `/admin/entities/${entityId}/api-keys/${keyId}/rotate`
  )
}
