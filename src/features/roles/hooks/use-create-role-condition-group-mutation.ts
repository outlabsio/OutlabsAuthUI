import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createRoleConditionGroup } from '@/features/roles/api/create-role-condition-group'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { CreateRoleConditionGroupInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateRoleConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: CreateRoleConditionGroupInput) => createRoleConditionGroup(input),
    meta: withMutationToast({
      error: 'The role condition group could not be created.',
      success: 'Role condition group created.',
    }),
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
