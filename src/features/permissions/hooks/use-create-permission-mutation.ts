import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createPermission } from '@/features/permissions/api/create-permission'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CreatePermissionInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreatePermissionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.create(),
    mutationFn: (input: CreatePermissionInput) => createPermission(input),
    meta: withMutationToast({
      error: 'The permission could not be created.',
      success: 'Permission created.',
    }),
    onSuccess: async (permission) => {
      queryClient.setQueryData(permissionsKeys.detail(permission.id), permission)

      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.lists(),
      })
    },
  })
}
