import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createUser } from '@/features/users/api/create-user'
import { usersKeys } from '@/features/users/api/users.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useCreateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.create(),
    mutationFn: createUser,
    meta: withMutationToast({
      error: 'The user could not be created.',
      success: 'User created.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)

      await queryClient.invalidateQueries({
        queryKey: usersKeys.lists(),
      })
    },
  })
}
