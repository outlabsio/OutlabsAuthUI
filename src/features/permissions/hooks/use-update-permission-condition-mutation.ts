import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updatePermissionCondition } from '@/features/permissions/api/update-permission-condition'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { UpdatePermissionConditionInput } from '@/features/permissions/types/permissions.types'

export function useUpdatePermissionConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: UpdatePermissionConditionInput) =>
      updatePermissionCondition(input),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.conditions(variables.permissionId),
      })
    },
  })
}
