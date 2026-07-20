import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { deleteEntityApiKey } from '@/features/api-keys/api/delete-entity-api-key'
import type { DeleteEntityApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useDeleteEntityApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: DeleteEntityApiKeyInput) => deleteEntityApiKey(input),
    meta: withMutationToast({
      error: 'The API key could not be revoked.',
      success: 'API key revoked.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.lists(),
      })
    },
  })
}
