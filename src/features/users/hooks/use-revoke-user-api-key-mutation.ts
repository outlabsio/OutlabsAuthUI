import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { revokeUserApiKey } from '@/features/users/api/revoke-user-api-key'
import { usersKeys } from '@/features/users/api/users.keys'
import type { RevokeUserApiKeyInput } from '@/features/users/types/users.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRevokeUserApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: RevokeUserApiKeyInput) => revokeUserApiKey(input),
    meta: withMutationToast({
      error: 'The API key could not be revoked.',
      success: 'API key revoked.',
    }),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: usersKeys.apiKeys(variables.userId),
        }),
        queryClient.invalidateQueries({
          queryKey: apiKeysKeys.lists(),
        }),
      ])
    },
  })
}
