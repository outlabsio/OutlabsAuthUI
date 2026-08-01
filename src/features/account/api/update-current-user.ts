import type { SessionUser } from '@/features/auth/types/auth.types'
import type { UpdateCurrentUserInput } from '@/features/account/types/account.types'
import { apiClient } from '@/lib/api/client'

export function updateCurrentUser(body: UpdateCurrentUserInput) {
  return apiClient.patch<SessionUser>('/users/me', {
    body,
  })
}
