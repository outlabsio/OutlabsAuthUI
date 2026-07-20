import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updatePermission } from '@/features/permissions/api/update-permission'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { UpdatePermissionInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdatePermissionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.update(),
    mutationFn: (input: UpdatePermissionInput) => updatePermission(input),
    meta: withMutationToast({
      error: 'The permission could not be updated.',
      success: 'Permission updated.',
    }),
    onSuccess: async (permission) => {
      queryClient.setQueryData(permissionsKeys.detail(permission.id), permission)

      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.lists(),
      })
    },
  })
}
