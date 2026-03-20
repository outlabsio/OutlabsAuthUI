import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { rotateApiKey } from '@/features/api-keys/api/rotate-api-key'
import type { RotateApiKeyInput } from '@/features/api-keys/types/api-keys.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRotateApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: (input: RotateApiKeyInput) => rotateApiKey(input),
    meta: withMutationToast({
      error: 'The API key could not be rotated.',
      success: 'API key rotated.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.lists(),
      })
    },
  })
}
