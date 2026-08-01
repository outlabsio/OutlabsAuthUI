import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { verifyAccessCode } from '@/features/auth/api/verify-access-code'
import { finalizeAuthSession } from '@/features/auth/utils/finalize-auth-session'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useVerifyAccessCodeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: authKeys.accessCodeVerify(),
    mutationFn: verifyAccessCode,
    meta: withMutationToast({
      error: 'Unable to sign in with this access code.',
      success: 'Signed in.',
    }),
    onSuccess: async (tokens) => finalizeAuthSession(queryClient, tokens),
  })
}
