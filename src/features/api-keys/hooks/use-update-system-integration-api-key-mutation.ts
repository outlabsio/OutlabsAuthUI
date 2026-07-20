import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { updateSystemIntegrationApiKey } from '@/features/api-keys/api/update-system-integration-api-key'
import type { UpdateSystemIntegrationApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateSystemIntegrationApiKeyMutation(options?: {
  skipErrorToast?: boolean
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: UpdateSystemIntegrationApiKeyInput) =>
      updateSystemIntegrationApiKey(input),
    meta: withMutationToast({
      error: 'The machine API key could not be updated.',
      success: 'Machine API key updated.',
      skipErrorToast: options?.skipErrorToast,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.principalKeyLists(),
      })
    },
  })
}
