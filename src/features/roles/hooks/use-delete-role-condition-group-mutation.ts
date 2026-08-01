import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteRoleConditionGroup } from '@/features/roles/api/delete-role-condition-group'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { DeleteRoleConditionGroupInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteRoleConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: DeleteRoleConditionGroupInput) => deleteRoleConditionGroup(input),
    meta: withMutationToast({
      error: 'The role condition group could not be deleted.',
      success: 'Role condition group deleted.',
    }),
    onSuccess: async (_result, variables) => {
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
