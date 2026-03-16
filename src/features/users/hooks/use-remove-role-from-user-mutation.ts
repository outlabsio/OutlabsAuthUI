import { useMutation, useQueryClient } from '@tanstack/react-query'

import { removeRoleFromUser } from '@/features/users/api/remove-role-from-user'
import { usersKeys } from '@/features/users/api/users.keys'
import type { RemoveUserRoleInput } from '@/features/users/types/users.types'

export function useRemoveRoleFromUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: RemoveUserRoleInput) => removeRoleFromUser(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: usersKeys.roles(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.roleMemberships(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.permissions(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(variables.userId),
        }),
      ])
    },
  })
}
