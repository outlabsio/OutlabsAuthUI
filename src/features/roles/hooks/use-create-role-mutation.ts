import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createRole } from '@/features/roles/api/create-role'
import { rolesKeys } from '@/features/roles/api/roles.keys'
import type { CreateRoleInput } from '@/features/roles/types/roles.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateRoleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: rolesKeys.create(),
    mutationFn: (input: CreateRoleInput) => createRole(input),
    meta: withMutationToast({
      error: 'The role could not be created.',
      success: 'Role created.',
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
