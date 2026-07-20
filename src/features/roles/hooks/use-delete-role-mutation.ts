import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteRole } from '@/features/roles/api/delete-role'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { DeleteRoleInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.remove(),
    mutationFn: (input: DeleteRoleInput) => deleteRole(input),
    meta: withMutationToast({
      error: 'The role could not be deleted.',
      success: 'Role deleted.',
    }),
    onSuccess: async (_result, variables) => {
      queryClient.removeQueries({
        queryKey: rolesKeys.detail(variables.roleId),
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolesKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: rolesKeys.infiniteLists() }),
        queryClient.invalidateQueries({ queryKey: rolesKeys.entityLists() }),
      ])
    },
  })
}
