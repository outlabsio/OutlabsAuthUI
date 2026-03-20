import type {
  CreateApiKeyResponse,
  RotateApiKeyInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function rotateApiKey({ keyId }: RotateApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>(`/api-keys/${keyId}/rotate`)
}
