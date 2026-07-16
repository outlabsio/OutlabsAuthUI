import type { SessionUser } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export type ConfirmPhoneVerificationInput = {
  code: string
}

export function confirmPhoneVerification(body: ConfirmPhoneVerificationInput) {
  return apiClient.post<SessionUser>('/users/me/phone/verify-code', {
    body,
  })
}
