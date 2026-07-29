import type { MagicLinkRequestInput } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'
import { withFrontendProfile } from '@/lib/api/frontend-profile'

export function requestMagicLink(input: MagicLinkRequestInput) {
  return apiClient.post<void>('/auth/magic-link/request', {
    auth: false,
    body: withFrontendProfile(input),
  })
}
