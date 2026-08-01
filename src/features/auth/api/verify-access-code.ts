import type {
  AccessCodeVerifyInput,
  AuthTokens,
} from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function verifyAccessCode(input: AccessCodeVerifyInput) {
  return apiClient.post<AuthTokens>('/auth/access-code/verify', {
    auth: false,
    body: input,
  })
}
