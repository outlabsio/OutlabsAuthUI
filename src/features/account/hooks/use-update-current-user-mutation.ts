import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { updateCurrentUser } from '@/features/account/api/update-current-user'
import type { UpdateCurrentUserInput } from '@/features/account/types/account.types'
import { authKeys } from '@/features/auth/api/auth.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateCurrentUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: accountKeys.updateProfile(),
    mutationFn: (input: UpdateCurrentUserInput) => updateCurrentUser(input),
    meta: withMutationToast({
      error: 'Unable to update your account.',
      success: 'Profile saved.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(authKeys.session(), user)

      await queryClient.invalidateQueries({
        queryKey: authKeys.session(),
      })
    },
  })
}
