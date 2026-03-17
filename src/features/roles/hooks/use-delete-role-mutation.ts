import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteRole } from '@/features/roles/api/delete-role'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { DeleteRoleInput } from '@/features/roles/types/roles.types'

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: DeleteRoleInput) => deleteRole(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: rolesKeys.all,
      })
    },
  })
}
