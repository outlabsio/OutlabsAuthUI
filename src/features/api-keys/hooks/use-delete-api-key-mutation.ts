import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { deleteApiKey } from '@/features/api-keys/api/delete-api-key'
import type { DeleteApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: DeleteApiKeyInput) => deleteApiKey(input),
    meta: withMutationToast({
      error: 'The API key could not be revoked.',
      success: 'API key revoked.',
    }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.lists(),
      })
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.grantableScopes({
          entityId: variables.entityId,
        }),
      })
    },
  })
}
