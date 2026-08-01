import { useMutation } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { startOAuthAssociate } from '@/features/account/api/start-oauth-associate'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useStartOAuthAssociateMutation() {
  return useMutation({
    mutationKey: accountKeys.startOAuthAssociate(),
    mutationFn: (provider: string) => startOAuthAssociate(provider),
    meta: withMutationToast({
      error: 'Could not start account linking.',
    }),
    onSuccess: (data) => {
      window.location.assign(data.authorization_url)
    },
  })
}
