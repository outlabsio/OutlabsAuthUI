import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deletePermissionCondition } from '@/features/permissions/api/delete-permission-condition'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { DeletePermissionConditionInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeletePermissionConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: DeletePermissionConditionInput) =>
      deletePermissionCondition(input),
    meta: withMutationToast({
      error: 'The permission condition could not be deleted.',
      success: 'Permission condition deleted.',
    }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.conditions(variables.permissionId),
      })
    },
  })
}
