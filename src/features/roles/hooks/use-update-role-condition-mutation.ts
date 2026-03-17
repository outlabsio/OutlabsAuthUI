import { useMutation, useQueryClient } from '@tanstack/react-query'

import { rolesKeys } from '@/features/roles/api/roles.keys'
import { updateRoleCondition } from '@/features/roles/api/update-role-condition'
import type { UpdateRoleConditionInput } from '@/features/roles/types/roles.types'

export function useUpdateRoleConditionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.all,
    mutationFn: (input: UpdateRoleConditionInput) => updateRoleCondition(input),
    onSuccess: async (_condition, variables) => {
      await queryClient.invalidateQueries({
        queryKey: rolesKeys.conditions(variables.roleId),
      })
    },
  })
}
