import type { InviteUserInput, User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export async function inviteUser(input: InviteUserInput) {
  return apiClient.post<User>('/auth/invite', {
    body: input,
  })
}
