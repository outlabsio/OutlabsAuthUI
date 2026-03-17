import { useMutation, useQueryClient } from '@tanstack/react-query'

import { rolesKeys } from '@/features/roles/api/roles.keys'
import { updateRole } from '@/features/roles/api/update-role'
import type { UpdateRoleInput } from '@/features/roles/types/roles.types'

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: UpdateRoleInput) => updateRole(input),
    onSuccess: async (role) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: rolesKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: rolesKeys.detail(role.id),
        }),
        queryClient.invalidateQueries({
          queryKey: rolesKeys.conditionGroups(role.id),
        }),
        queryClient.invalidateQueries({
          queryKey: rolesKeys.conditions(role.id),
        }),
      ])
    },
  })
}
