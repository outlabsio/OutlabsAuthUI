import { apiClient } from '@/lib/api/client'

export type OAuthAuthorizeResponse = {
  authorization_url: string
}

export function startOAuthAssociate(provider: string) {
  return apiClient.get<OAuthAuthorizeResponse>(
    `/oauth-associate/${provider}/authorize`
  )
}
