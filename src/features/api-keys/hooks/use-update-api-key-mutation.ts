import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { updateApiKey } from '@/features/api-keys/api/update-api-key'
import type { UpdateApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: UpdateApiKeyInput) => updateApiKey(input),
    meta: withMutationToast({
      error: 'The API key could not be updated.',
      success: 'API key updated.',
    }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.lists(),
      })
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.grantableScopes({
          entityId: variables.entity_ids?.[0],
        }),
      })
    },
  })
}
