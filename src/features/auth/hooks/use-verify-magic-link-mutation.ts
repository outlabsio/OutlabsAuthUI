import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { verifyMagicLink } from '@/features/auth/api/verify-magic-link'
import { finalizeAuthSession } from '@/features/auth/utils/finalize-auth-session'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useVerifyMagicLinkMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: authKeys.magicLinkVerify(),
    mutationFn: verifyMagicLink,
    meta: withMutationToast({
      error: 'Unable to sign in with this magic link.',
      success: 'Signed in.',
    }),
    onSuccess: async (tokens) => finalizeAuthSession(queryClient, tokens),
  })
}
