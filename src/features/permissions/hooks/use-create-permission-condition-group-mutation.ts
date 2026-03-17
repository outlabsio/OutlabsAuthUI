import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createPermissionConditionGroup } from '@/features/permissions/api/create-permission-condition-group'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CreatePermissionConditionGroupInput } from '@/features/permissions/types/permissions.types'

export function useCreatePermissionConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: CreatePermissionConditionGroupInput) =>
      createPermissionConditionGroup(input),
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
