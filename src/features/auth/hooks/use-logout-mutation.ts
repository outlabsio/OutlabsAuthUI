import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { logout } from '@/features/auth/api/logout'
import { expireAuthSession } from '@/lib/api/auth-session'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useLogoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: authKeys.logout(),
    mutationFn: () => logout(),
    meta: withMutationToast({
      skipErrorToast: true,
    }),
    onSettled: () => {
      expireAuthSession()
      queryClient.clear()
    },
  })
}
