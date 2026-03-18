import type { QueryClient } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { getSessionQueryOptions } from '@/features/auth/api/auth.query-options'
import type { AuthTokens } from '@/features/auth/types/auth.types'
import { setStoredAuthTokens } from '@/lib/api/auth-token'

export async function finalizeAuthSession(
  queryClient: QueryClient,
  tokens: AuthTokens
) {
  setStoredAuthTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  })

  queryClient.removeQueries({
    queryKey: authKeys.session(),
  })

  await queryClient.fetchQuery(getSessionQueryOptions())

  return tokens
}
