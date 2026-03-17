import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createPermissionCondition } from '@/features/permissions/api/create-permission-condition'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CreatePermissionConditionInput } from '@/features/permissions/types/permissions.types'

export function useCreatePermissionConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: CreatePermissionConditionInput) =>
      createPermissionCondition(input),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.conditions(variables.permissionId),
      })
    },
  })
}
