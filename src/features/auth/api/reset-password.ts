import type { ResetPasswordInput } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function resetPassword(input: ResetPasswordInput) {
  return apiClient.post<void>('/auth/reset-password', {
    auth: false,
    body: input,
  })
}
