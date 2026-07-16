import { useMutation } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { startOAuthLogin } from '@/features/auth/api/start-oauth-login'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useStartOAuthLoginMutation() {
  return useMutation({
    mutationKey: authKeys.startOAuthLogin(),
    mutationFn: (provider: string) => startOAuthLogin(provider),
    meta: withMutationToast({
      error: 'Google sign-in is not available for this backend.',
    }),
    onSuccess: (data) => {
      window.location.assign(data.authorization_url)
    },
  })
}
