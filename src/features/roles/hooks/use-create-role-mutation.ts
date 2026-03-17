import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createRole } from '@/features/roles/api/create-role'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { CreateRoleInput } from '@/features/roles/types/roles.types'

export function useCreateRoleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: CreateRoleInput) => createRole(input),
    onSuccess: async (role) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: rolesKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: rolesKeys.detail(role.id),
        }),
      ])
    },
  })
}
