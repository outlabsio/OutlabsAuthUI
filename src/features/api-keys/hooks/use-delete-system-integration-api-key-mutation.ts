import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { deleteSystemIntegrationApiKey } from '@/features/api-keys/api/delete-system-integration-api-key'
import type { DeleteSystemIntegrationApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteSystemIntegrationApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: DeleteSystemIntegrationApiKeyInput) =>
      deleteSystemIntegrationApiKey(input),
    meta: withMutationToast({
      error: 'The system integration key could not be revoked.',
      success: 'System integration key revoked.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })
    },
  })
}
