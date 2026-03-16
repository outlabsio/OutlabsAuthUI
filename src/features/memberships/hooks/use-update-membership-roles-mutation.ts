import { useMutation, useQueryClient } from '@tanstack/react-query'

import { membershipsKeys } from '@/features/memberships/api/memberships.keys'
import { updateMembershipRoles } from '@/features/memberships/api/update-membership-roles'
import type { UpdateMembershipRolesInput } from '@/features/memberships/types/memberships.types'
import { usersKeys } from '@/features/users/api/users.keys'

export function useUpdateMembershipRolesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: membershipsKeys.all,
    mutationFn: (input: UpdateMembershipRolesInput) => updateMembershipRoles(input),
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
