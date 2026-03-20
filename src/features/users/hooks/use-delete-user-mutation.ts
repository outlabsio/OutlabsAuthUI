import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteUser } from '@/features/users/api/delete-user'
import { usersKeys } from '@/features/users/api/users.keys'
import type { DeleteUserInput } from '@/features/users/types/users.types'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: DeleteUserInput) => deleteUser(input),
    meta: withMutationToast({
      error: 'The user could not be deleted.',
      success: 'User deleted.',
    }),
    onSuccess: async (_result, variables) => {
      const queryKeys = [
        usersKeys.detail(variables.userId),
        usersKeys.lists(),
        usersKeys.roles(variables.userId),
        usersKeys.permissions(variables.userId),
        usersKeys.roleMemberships(variables.userId),
        usersKeys.auditEventsRoot(variables.userId),
        usersKeys.membershipHistoryRoot(variables.userId),
        membershipsKeys.userList(variables.userId),
        membershipsKeys.userList(variables.userId, true),
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
