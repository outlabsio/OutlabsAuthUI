import type {
  AuthTokens,
  MagicLinkVerifyInput,
} from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function verifyMagicLink(input: MagicLinkVerifyInput) {
  return apiClient.post<AuthTokens>('/auth/magic-link/verify', {
    auth: false,
    body: input,
  })
}
