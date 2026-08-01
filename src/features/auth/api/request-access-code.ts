import type { AccessCodeRequestInput } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'
import { withFrontendProfile } from '@/lib/api/frontend-profile'

export function requestAccessCode(input: AccessCodeRequestInput) {
  return apiClient.post<void>('/auth/access-code/request', {
    auth: false,
    body: withFrontendProfile(input),
  })
}
