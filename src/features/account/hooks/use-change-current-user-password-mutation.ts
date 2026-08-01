import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { changeCurrentUserPassword } from '@/features/account/api/change-current-user-password'
import type { ChangeCurrentUserPasswordInput } from '@/features/account/types/account.types'
import { authKeys } from '@/features/auth/api/auth.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useChangeCurrentUserPasswordMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: accountKeys.changePassword(),
    mutationFn: (input: ChangeCurrentUserPasswordInput) =>
      changeCurrentUserPassword(input),
    meta: withMutationToast({
      error: 'Unable to update your password.',
      success: 'Password updated.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: authKeys.session(),
      })
    },
  })
}
