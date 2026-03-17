import { useMutation, useQueryClient } from '@tanstack/react-query'

import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { removeMembership } from '@/features/memberships/api/remove-membership'
import type { RemoveMembershipInput } from '@/features/memberships/types/memberships.types'
import { usersKeys } from '@/features/users/api/users.keys'

export function useRemoveMembershipMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: membershipsKeys.all,
    mutationFn: (input: RemoveMembershipInput) => removeMembership(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: membershipsKeys.userLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.permissions(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: entitiesKeys.memberLists(),
        }),
      ])
    },
  })
}
