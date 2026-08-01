import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { revokeAllMySessions } from '@/features/account/api/revoke-all-my-sessions'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRevokeAllMySessionsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: accountKeys.revokeAllSessions(),
    mutationFn: () => revokeAllMySessions(),
    meta: withMutationToast({
      error: 'Sessions could not be revoked.',
      success: 'All sessions revoked.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountKeys.sessions(),
      })
    },
  })
}
