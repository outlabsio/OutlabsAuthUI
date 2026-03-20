import type {
  CreateApiKeyInput,
  CreateApiKeyResponse,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export function createApiKey(input: CreateApiKeyInput) {
  return apiClient.post<CreateApiKeyResponse>('/api-keys/', {
    body: input,
  })
}
