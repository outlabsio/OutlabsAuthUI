import { useMutation, useQueryClient } from '@tanstack/react-query'

import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { createMembership } from '@/features/memberships/api/create-membership'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { usersKeys } from '@/features/users/api/users.keys'
import type { CreateMembershipInput } from '@/features/memberships/types/memberships.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateMembershipMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: membershipsKeys.all,
    mutationFn: (input: CreateMembershipInput) => createMembership(input),
    meta: withMutationToast({
      error: 'The entity access could not be granted.',
      success: 'Entity access granted.',
    }),
    onSuccess: async (_membership, variables) => {
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
          queryKey: entitiesKeys.members(variables.entityId),
        }),
      ])
    },
  })
}
