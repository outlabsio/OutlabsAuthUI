import type { AcceptInviteInput, AuthTokens } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function acceptInvite(input: AcceptInviteInput) {
  return apiClient.post<AuthTokens>('/auth/accept-invite', {
    auth: false,
    body: input,
  })
}
