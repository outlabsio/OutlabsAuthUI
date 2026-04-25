import type { AccessCodeRequestInput } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function requestAccessCode(input: AccessCodeRequestInput) {
  return apiClient.post<void>('/auth/access-code/request', {
    auth: false,
    body: input,
  })
}
