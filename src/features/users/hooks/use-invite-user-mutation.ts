import { useMutation, useQueryClient } from '@tanstack/react-query'

import { inviteUser } from '@/features/users/api/invite-user'
import { usersKeys } from '@/features/users/api/users.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useInviteUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.invite(),
    mutationFn: inviteUser,
    meta: withMutationToast({
      error: 'The invitation could not be sent.',
      success: 'Invitation sent.',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersKeys.lists(),
      })
    },
  })
}
