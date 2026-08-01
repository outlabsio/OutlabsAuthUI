import type { User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export async function resendInvite(userId: string) {
  return apiClient.post<User>(`/users/${userId}/resend-invite`)
}
