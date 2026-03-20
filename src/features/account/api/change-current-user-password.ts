import type { ChangeCurrentUserPasswordInput } from '@/features/account/types/account.types'
import { apiClient } from '@/lib/api/client'

export function changeCurrentUserPassword(
  body: ChangeCurrentUserPasswordInput
) {
  return apiClient.post<void>('/users/me/change-password', {
    body,
  })
}
