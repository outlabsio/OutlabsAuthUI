import { useMutation, useQueryClient } from '@tanstack/react-query'

import { assignRoleToUser } from '@/features/users/api/assign-role-to-user'
import type { AssignUserRoleInput } from '@/features/users/types/users.types'
import { usersKeys } from '@/features/users/api/users.keys'

export function useAssignRoleToUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: AssignUserRoleInput) => assignRoleToUser(input),
    onSuccess: async (_assignment, variables) => {
      await Promise.all([
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
