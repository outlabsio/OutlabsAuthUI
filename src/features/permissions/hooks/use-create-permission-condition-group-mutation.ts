import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createPermissionConditionGroup } from '@/features/permissions/api/create-permission-condition-group'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CreatePermissionConditionGroupInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreatePermissionConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: CreatePermissionConditionGroupInput) =>
      createPermissionConditionGroup(input),
    meta: withMutationToast({
      error: 'The permission condition group could not be created.',
      success: 'Permission condition group created.',
    }),
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
