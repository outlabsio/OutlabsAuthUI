import { useMutation, useQueryClient } from '@tanstack/react-query'

import { rolesKeys } from '@/features/roles/api/roles.keys'
import { updateRole } from '@/features/roles/api/update-role'
import type { UpdateRoleInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.update(),
    mutationFn: (input: UpdateRoleInput) => updateRole(input),
    meta: withMutationToast({
      error: 'The role could not be updated.',
      success: 'Role updated.',
    }),
    onSuccess: async (role) => {
      queryClient.setQueryData(rolesKeys.detail(role.id), role)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolesKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: rolesKeys.infiniteLists() }),
        queryClient.invalidateQueries({ queryKey: rolesKeys.entityLists() }),
      ])
    },
  })
}
