import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteRoleConditionGroup } from '@/features/roles/api/delete-role-condition-group'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { DeleteRoleConditionGroupInput } from '@/features/roles/types/roles.types'

export function useDeleteRoleConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: DeleteRoleConditionGroupInput) => deleteRoleConditionGroup(input),
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
