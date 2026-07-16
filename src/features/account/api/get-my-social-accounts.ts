import type { SocialAccount } from '@/features/account/types/social-account.types'
import { apiClient } from '@/lib/api/client'

export function getMySocialAccounts() {
  return apiClient.get<SocialAccount[]>('/users/me/social-accounts')
}
