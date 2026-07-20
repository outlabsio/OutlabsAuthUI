import { useMutation, useQueryClient } from '@tanstack/react-query'

import { entitiesKeys } from '@/features/entities/api/entities.keys'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { updateMembership } from '@/features/memberships/api/update-membership'
import type { UpdateMembershipInput } from '@/features/memberships/types/memberships.types'
import { usersKeys } from '@/features/users/api/users.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateMembershipMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: membershipsKeys.all,
    mutationFn: (input: UpdateMembershipInput) => updateMembership(input),
    meta: withMutationToast({
      error: 'The entity access could not be updated.',
      success: 'Entity access updated.',
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
