import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteRoleCondition } from '@/features/roles/api/delete-role-condition'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { DeleteRoleConditionInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteRoleConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: DeleteRoleConditionInput) => deleteRoleCondition(input),
    meta: withMutationToast({
      error: 'The role condition could not be deleted.',
      success: 'Role condition deleted.',
    }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: rolesKeys.conditions(variables.roleId),
      })
    },
  })
}
