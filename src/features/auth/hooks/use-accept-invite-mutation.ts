import { useMutation, useQueryClient } from '@tanstack/react-query'

import { acceptInvite } from '@/features/auth/api/accept-invite'
import { authKeys } from '@/features/auth/api/auth.keys'
import { finalizeAuthSession } from '@/features/auth/utils/finalize-auth-session'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useAcceptInviteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: authKeys.acceptInvite(),
    mutationFn: acceptInvite,
    meta: withMutationToast({
      error: 'Unable to accept this invitation.',
      success: 'Invitation accepted. Signed in.',
    }),
    onSuccess: async (tokens) => finalizeAuthSession(queryClient, tokens),
  })
}
