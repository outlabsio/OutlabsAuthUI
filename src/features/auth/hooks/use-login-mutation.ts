import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { getSessionQueryOptions } from '@/features/auth/api/auth.query-options'
import { login } from '@/features/auth/api/login'
import { setStoredAuthTokens } from '@/lib/api/auth-token'

export function useLoginMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: authKeys.login(),
    mutationFn: login,
    onSuccess: async (tokens) => {
      setStoredAuthTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      })

      queryClient.removeQueries({
        queryKey: authKeys.session(),
      })

      await queryClient.fetchQuery(getSessionQueryOptions())
    },
  })
}
