import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateUserRoleMembership } from '@/features/users/api/update-user-role-membership'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UpdateUserRoleMembershipInput } from '@/features/users/types/users.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateUserRoleMembershipMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: UpdateUserRoleMembershipInput) =>
      updateUserRoleMembership(input),
    meta: withMutationToast({
      error: 'The direct role window could not be updated.',
      success: 'Direct role window updated.',
    }),
    onSuccess: async (_assignment, variables) => {
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
          queryKey: usersKeys.auditEventsRoot(variables.userId),
        }),
      ])
    },
  })
}
