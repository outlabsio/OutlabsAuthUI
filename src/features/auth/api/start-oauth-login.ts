import { apiClient } from '@/lib/api/client'
import { withFrontendProfileQuery } from '@/lib/api/frontend-profile'

export type OAuthAuthorizeResponse = {
  authorization_url: string
}

export function startOAuthLogin(provider: string) {
  return apiClient.get<OAuthAuthorizeResponse>(
    withFrontendProfileQuery(`/oauth/${provider}/authorize`),
    { auth: false }
  )
}
