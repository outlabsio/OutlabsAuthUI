import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateUserSuperuser } from '@/features/users/api/update-user-superuser'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UpdateUserSuperuserInput } from '@/features/users/types/users.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateUserSuperuserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.update(),
    mutationFn: (input: UpdateUserSuperuserInput) =>
      updateUserSuperuser(input),
    meta: withMutationToast({
      error: 'Unable to update superuser access.',
      success: 'Superuser access updated.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)

      const queryKeys = [
        usersKeys.lists(),
        usersKeys.permissions(user.id),
        usersKeys.auditEventsRoot(user.id),
      ] as const

      await Promise.all(
        queryKeys.flatMap((queryKey) => [
          queryClient.invalidateQueries({ queryKey }),
          queryClient.refetchQueries({ queryKey }),
        ])
      )
    },
  })
}
