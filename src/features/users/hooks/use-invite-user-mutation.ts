import { useMutation, useQueryClient } from '@tanstack/react-query'

import { inviteUser } from '@/features/users/api/invite-user'
import { usersKeys } from '@/features/users/api/users.keys'

export function useInviteUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.invite(),
    mutationFn: inviteUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersKeys.lists(),
      })
    },
  })
}
