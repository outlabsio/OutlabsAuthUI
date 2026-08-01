import type { ResetUserPasswordInput } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function resetUserPassword(input: ResetUserPasswordInput) {
  return apiClient.patch<void>(`/users/${input.userId}/password`, {
    body: {
      new_password: input.new_password,
    },
  })
}
