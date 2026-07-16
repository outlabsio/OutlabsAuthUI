import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { createSystemIntegrationApiKey } from '@/features/api-keys/api/create-system-integration-api-key'
import type { CreateSystemIntegrationApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateSystemIntegrationApiKeyMutation(options?: {
  skipErrorToast?: boolean
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: CreateSystemIntegrationApiKeyInput) =>
      createSystemIntegrationApiKey(input),
    meta: withMutationToast({
      error: 'The machine API key could not be created.',
      success: 'Machine API key created.',
      skipErrorToast: options?.skipErrorToast,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })
}
