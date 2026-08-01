import { apiClient } from '@/lib/api/client'

export function unlinkMySocialAccount(accountId: string) {
  return apiClient.delete<void>(`/users/me/social-accounts/${accountId}`)
}
