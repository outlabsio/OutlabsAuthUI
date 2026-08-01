import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { unlinkMySocialAccount } from '@/features/account/api/unlink-my-social-account'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUnlinkMySocialAccountMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: accountKeys.unlinkSocialAccount(),
    mutationFn: (accountId: string) => unlinkMySocialAccount(accountId),
    meta: withMutationToast({
      error: 'The linked account could not be unlinked.',
      success: 'Linked account removed.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountKeys.socialAccounts(),
      })
    },
  })
}
