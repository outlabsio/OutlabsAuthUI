import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { createIntegrationPrincipal } from '@/features/api-keys/api/create-integration-principal'
import type { CreateIntegrationPrincipalInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateIntegrationPrincipalMutation(options?: {
  skipErrorToast?: boolean
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: CreateIntegrationPrincipalInput) =>
      createIntegrationPrincipal(input),
    meta: withMutationToast({
      error: 'The service account could not be created.',
      success: 'Service account created.',
      skipErrorToast: options?.skipErrorToast,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })
}
