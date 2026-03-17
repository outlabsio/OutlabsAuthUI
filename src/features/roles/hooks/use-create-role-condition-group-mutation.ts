import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createRoleConditionGroup } from '@/features/roles/api/create-role-condition-group'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { CreateRoleConditionGroupInput } from '@/features/roles/types/roles.types'

export function useCreateRoleConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: CreateRoleConditionGroupInput) => createRoleConditionGroup(input),
    onSuccess: async (_group, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: rolesKeys.conditionGroups(variables.roleId),
        }),
        queryClient.invalidateQueries({
          queryKey: rolesKeys.conditions(variables.roleId),
        }),
      ])
    },
  })
}
