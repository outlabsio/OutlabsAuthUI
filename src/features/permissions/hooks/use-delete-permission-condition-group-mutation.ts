import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deletePermissionConditionGroup } from '@/features/permissions/api/delete-permission-condition-group'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { DeletePermissionConditionGroupInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeletePermissionConditionGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: DeletePermissionConditionGroupInput) =>
      deletePermissionConditionGroup(input),
    meta: withMutationToast({
      error: 'The permission condition group could not be deleted.',
      success: 'Permission condition group deleted.',
    }),
    onSuccess: async (_result, variables) => {
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
