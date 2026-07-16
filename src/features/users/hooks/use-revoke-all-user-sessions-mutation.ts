import { useMutation, useQueryClient } from '@tanstack/react-query'

import { revokeAllUserSessions } from '@/features/users/api/revoke-all-user-sessions'
import { usersKeys } from '@/features/users/api/users.keys'
import type { RevokeAllUserSessionsInput } from '@/features/users/types/user-session.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRevokeAllUserSessionsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: RevokeAllUserSessionsInput) => revokeAllUserSessions(input),
    meta: withMutationToast({
      error: 'Sessions could not be revoked.',
      success: 'All sessions revoked.',
    }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: usersKeys.sessions(variables.userId),
      })
    },
  })
}
