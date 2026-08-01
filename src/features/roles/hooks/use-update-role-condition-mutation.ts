import { useMutation, useQueryClient } from '@tanstack/react-query'

import { rolesKeys } from '@/features/roles/api/roles.keys'
import { updateRoleCondition } from '@/features/roles/api/update-role-condition'
import type { UpdateRoleConditionInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateRoleConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: UpdateRoleConditionInput) => updateRoleCondition(input),
    meta: withMutationToast({
      error: 'The role condition could not be updated.',
      success: 'Role condition updated.',
    }),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: rolesKeys.conditions(variables.roleId),
      })
    },
  })
}
