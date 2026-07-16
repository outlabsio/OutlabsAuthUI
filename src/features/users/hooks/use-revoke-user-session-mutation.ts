import { useMutation, useQueryClient } from '@tanstack/react-query'

import { revokeUserSession } from '@/features/users/api/revoke-user-session'
import { usersKeys } from '@/features/users/api/users.keys'
import type { RevokeUserSessionInput } from '@/features/users/types/user-session.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRevokeUserSessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: RevokeUserSessionInput) => revokeUserSession(input),
    meta: withMutationToast({
      error: 'The session could not be revoked.',
      success: 'Session revoked.',
    }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: usersKeys.sessions(variables.userId),
      })
    },
  })
}
