import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updatePermissionConditionGroup } from '@/features/permissions/api/update-permission-condition-group'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { UpdatePermissionConditionGroupInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdatePermissionConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: UpdatePermissionConditionGroupInput) =>
      updatePermissionConditionGroup(input),
    meta: withMutationToast({
      error: 'The permission condition group could not be updated.',
      success: 'Permission condition group updated.',
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
