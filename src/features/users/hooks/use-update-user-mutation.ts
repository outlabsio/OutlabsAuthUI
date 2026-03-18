import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateUser } from '@/features/users/api/update-user'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UpdateUserInput } from '@/features/users/types/users.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: UpdateUserInput) => updateUser(input),
    meta: withMutationToast({
      error: 'Unable to update this user.',
      success: 'Profile saved.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.lists(),
        }),
      ])
    },
  })
}
