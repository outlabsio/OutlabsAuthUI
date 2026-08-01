import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { login } from '@/features/auth/api/login'
import { withMutationToast } from '@/lib/query/mutation-toast'
import { finalizeAuthSession } from '@/features/auth/utils/finalize-auth-session'

export function useLoginMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: authKeys.login(),
    mutationFn: login,
    meta: withMutationToast({
      skipErrorToast: true,
    }),
    onSuccess: async (tokens) => finalizeAuthSession(queryClient, tokens),
  })
}
