import { useMutation, useQueryClient } from '@tanstack/react-query'

import { restoreUser } from '@/features/users/api/restore-user'
import { usersKeys } from '@/features/users/api/users.keys'
import type { RestoreUserInput } from '@/features/users/types/users.types'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRestoreUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.update(),
    mutationFn: (input: RestoreUserInput) => restoreUser(input),
    meta: withMutationToast({
      error: 'The user could not be restored.',
      success: 'User restored.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)

      const queryKeys = [
        usersKeys.lists(),
        usersKeys.permissions(user.id),
        usersKeys.roleMemberships(user.id),
        usersKeys.auditEventsRoot(user.id),
        usersKeys.membershipHistoryRoot(user.id),
        membershipsKeys.userList(user.id),
        membershipsKeys.userList(user.id, true),
      ] as const

      await Promise.all(
        queryKeys.flatMap((queryKey) => [
          queryClient.invalidateQueries({ queryKey }),
          queryClient.refetchQueries({ queryKey }),
        ])
      )
    },
  })
}
