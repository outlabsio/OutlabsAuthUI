import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteUser } from '@/features/users/api/delete-user'
import { usersKeys } from '@/features/users/api/users.keys'
import type { DeleteUserInput } from '@/features/users/types/users.types'
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
      queryClient.removeQueries({
        queryKey: usersKeys.detail(variables.userId),
      })

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: usersKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.roles(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.permissions(variables.userId),
        }),
      ])
    },
  })
}
