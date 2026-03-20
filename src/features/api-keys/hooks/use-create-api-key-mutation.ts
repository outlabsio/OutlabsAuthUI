import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { createApiKey } from '@/features/api-keys/api/create-api-key'
import type { CreateApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: CreateApiKeyInput) => createApiKey(input),
    meta: withMutationToast({
      error: 'The API key could not be created.',
      success: 'API key created.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.lists(),
      })
    },
  })
}
