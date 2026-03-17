import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteRoleCondition } from '@/features/roles/api/delete-role-condition'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { DeleteRoleConditionInput } from '@/features/roles/types/roles.types'

export function useDeleteRoleConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: DeleteRoleConditionInput) => deleteRoleCondition(input),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: rolesKeys.conditions(variables.roleId),
      })
    },
  })
}
