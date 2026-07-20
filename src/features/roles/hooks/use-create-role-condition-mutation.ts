import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createRoleCondition } from '@/features/roles/api/create-role-condition'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { CreateRoleConditionInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateRoleConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: CreateRoleConditionInput) => createRoleCondition(input),
    meta: withMutationToast({
      error: 'The role condition could not be created.',
      success: 'Role condition created.',
    }),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: rolesKeys.conditions(variables.roleId),
      })
    },
  })
}
