import { useMutation, useQueryClient } from '@tanstack/react-query'

import { rolesKeys } from '@/features/roles/api/roles.keys'
import { updateRoleConditionGroup } from '@/features/roles/api/update-role-condition-group'
import type { UpdateRoleConditionGroupInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateRoleConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: UpdateRoleConditionGroupInput) => updateRoleConditionGroup(input),
    meta: withMutationToast({
      error: 'The role condition group could not be updated.',
      success: 'Role condition group updated.',
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
