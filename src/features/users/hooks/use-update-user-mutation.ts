import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateUser } from '@/features/users/api/update-user'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UpdateUserInput } from '@/features/users/types/users.types'

export function useUpdateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: UpdateUserInput) => updateUser(input),
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
