import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { revokeMySession } from '@/features/account/api/revoke-my-session'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRevokeMySessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: accountKeys.revokeSession(),
    mutationFn: (sessionId: string) => revokeMySession(sessionId),
    meta: withMutationToast({
      error: 'The session could not be revoked.',
      success: 'Session revoked.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountKeys.sessions(),
      })
    },
  })
}
