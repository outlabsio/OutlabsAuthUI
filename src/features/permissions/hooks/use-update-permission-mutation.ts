import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updatePermission } from '@/features/permissions/api/update-permission'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { UpdatePermissionInput } from '@/features/permissions/types/permissions.types'

export function useUpdatePermissionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: UpdatePermissionInput) => updatePermission(input),
    onSuccess: async (permission) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: permissionsKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: permissionsKeys.detail(permission.id),
        }),
      ])
    },
  })
}
