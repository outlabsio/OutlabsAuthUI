import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { updateIntegrationPrincipal } from '@/features/api-keys/api/update-integration-principal'
import type { UpdateIntegrationPrincipalInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateIntegrationPrincipalMutation(options?: {
  skipErrorToast?: boolean
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: UpdateIntegrationPrincipalInput) =>
      updateIntegrationPrincipal(input),
    meta: withMutationToast({
      error: 'The service account could not be updated.',
      success: 'Service account updated.',
      skipErrorToast: options?.skipErrorToast,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })
}
