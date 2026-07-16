import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { rotateSystemIntegrationApiKey } from '@/features/api-keys/api/rotate-system-integration-api-key'
import type { RotateSystemIntegrationApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRotateSystemIntegrationApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: RotateSystemIntegrationApiKeyInput) =>
      rotateSystemIntegrationApiKey(input),
    meta: withMutationToast({
      error: 'The system integration key could not be rotated.',
      success: 'System integration key rotated.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })
}
