import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createPermissionCondition } from '@/features/permissions/api/create-permission-condition'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CreatePermissionConditionInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreatePermissionConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: CreatePermissionConditionInput) =>
      createPermissionCondition(input),
    meta: withMutationToast({
      error: 'The permission condition could not be created.',
      success: 'Permission condition created.',
    }),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.conditions(variables.permissionId),
      })
    },
  })
}
