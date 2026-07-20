import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updatePermissionCondition } from '@/features/permissions/api/update-permission-condition'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { UpdatePermissionConditionInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdatePermissionConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: UpdatePermissionConditionInput) =>
      updatePermissionCondition(input),
    meta: withMutationToast({
      error: 'The permission condition could not be updated.',
      success: 'Permission condition updated.',
    }),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.conditions(variables.permissionId),
      })
    },
  })
}
