import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { deleteIntegrationPrincipal } from '@/features/api-keys/api/delete-integration-principal'
import type { DeleteIntegrationPrincipalInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteIntegrationPrincipalMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: DeleteIntegrationPrincipalInput) =>
      deleteIntegrationPrincipal(input),
    meta: withMutationToast({
      error: 'The integration principal could not be archived.',
      success: 'Integration principal archived.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })
}
