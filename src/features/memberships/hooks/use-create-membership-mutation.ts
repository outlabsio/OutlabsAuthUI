import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createMembership } from '@/features/memberships/api/create-membership'
import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { usersKeys } from '@/features/users/api/users.keys'
import type { CreateMembershipInput } from '@/features/memberships/types/memberships.types'

export function useCreateMembershipMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: membershipsKeys.all,
    mutationFn: (input: CreateMembershipInput) => createMembership(input),
    onSuccess: async (_membership, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: membershipsKeys.userList(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.permissions(variables.userId),
        }),
      ])
    },
  })
}
