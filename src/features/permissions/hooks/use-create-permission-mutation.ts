import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createPermission } from '@/features/permissions/api/create-permission'
import { permissionsKeys } from '@/features/permissions/api/permissions.keys'
import type { CreatePermissionInput } from '@/features/permissions/types/permissions.types'

export function useCreatePermissionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: permissionsKeys.all,
    mutationFn: (input: CreatePermissionInput) => createPermission(input),
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
