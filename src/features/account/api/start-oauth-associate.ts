import { apiClient } from '@/lib/api/client'
import { withFrontendProfileQuery } from '@/lib/api/frontend-profile'

export type OAuthAuthorizeResponse = {
  authorization_url: string
}

export function startOAuthAssociate(provider: string) {
  return apiClient.get<OAuthAuthorizeResponse>(
    withFrontendProfileQuery(`/oauth-associate/${provider}/authorize`)
  )
}
