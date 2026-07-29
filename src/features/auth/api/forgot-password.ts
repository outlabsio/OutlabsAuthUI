import type { ForgotPasswordInput } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'
import { withFrontendProfile } from '@/lib/api/frontend-profile'

export function forgotPassword(input: ForgotPasswordInput) {
  return apiClient.post<void>('/auth/forgot-password', {
    auth: false,
    body: withFrontendProfile(input),
  })
}
