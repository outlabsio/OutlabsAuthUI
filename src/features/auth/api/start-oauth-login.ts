import { apiClient } from '@/lib/api/client'

export type OAuthAuthorizeResponse = {
  authorization_url: string
}

export function startOAuthLogin(provider: string) {
  return apiClient.get<OAuthAuthorizeResponse>(
    `/oauth/${provider}/authorize`,
    { auth: false }
  )
}
