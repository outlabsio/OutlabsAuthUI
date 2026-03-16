import { useMutation, useQueryClient } from '@tanstack/react-query'

import { resendInvite } from '@/features/users/api/resend-invite'
import { usersKeys } from '@/features/users/api/users.keys'

export function useResendInviteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: resendInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersKeys.lists(),
      })
    },
  })
}
