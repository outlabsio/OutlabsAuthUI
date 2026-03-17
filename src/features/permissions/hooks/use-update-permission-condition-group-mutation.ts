import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updatePermissionConditionGroup } from '@/features/permissions/api/update-permission-condition-group'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { UpdatePermissionConditionGroupInput } from '@/features/permissions/types/permissions.types'

export function useUpdatePermissionConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: UpdatePermissionConditionGroupInput) =>
      updatePermissionConditionGroup(input),
    onSuccess: async (_group, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: permissionsKeys.conditionGroups(variables.permissionId),
        }),
        queryClient.invalidateQueries({
          queryKey: permissionsKeys.conditions(variables.permissionId),
        }),
      ])
    },
  })
}
