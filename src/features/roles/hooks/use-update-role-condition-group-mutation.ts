import { useMutation, useQueryClient } from '@tanstack/react-query'

import { rolesKeys } from '@/features/roles/api/roles.keys'
import { updateRoleConditionGroup } from '@/features/roles/api/update-role-condition-group'
import type { UpdateRoleConditionGroupInput } from '@/features/roles/types/roles.types'

export function useUpdateRoleConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: UpdateRoleConditionGroupInput) => updateRoleConditionGroup(input),
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
