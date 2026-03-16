import { useMutation, useQueryClient } from '@tanstack/react-query'

import { resendInvite } from '@/features/users/api/resend-invite'
import { usersKeys } from '@/features/users/api/users.keys'

export function useResendInviteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: resendInvite,
    onSuccess: async (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: usersKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(user.id),
        }),
      ])
    },
  })
}
