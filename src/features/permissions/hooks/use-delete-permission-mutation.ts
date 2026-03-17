import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deletePermission } from '@/features/permissions/api/delete-permission'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { DeletePermissionInput } from '@/features/permissions/types/permissions.types'

export function useDeletePermissionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: DeletePermissionInput) => deletePermission(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: permissionsKeys.all,
      })
    },
  })
}
