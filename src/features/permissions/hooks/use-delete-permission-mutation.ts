import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deletePermission } from '@/features/permissions/api/delete-permission'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { DeletePermissionInput } from '@/features/permissions/types/permissions.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeletePermissionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.remove(),
    mutationFn: (input: DeletePermissionInput) => deletePermission(input),
    meta: withMutationToast({
      error: 'The permission could not be deleted.',
      success: 'Permission deleted.',
    }),
    onSuccess: async (_result, variables) => {
      queryClient.removeQueries({
        queryKey: permissionsKeys.detail(variables.permissionId),
      })

      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.lists(),
      })
    },
  })
}
