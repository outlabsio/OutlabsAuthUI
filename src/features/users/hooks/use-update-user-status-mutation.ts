import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateUserStatus } from '@/features/users/api/update-user-status'
import { usersKeys } from '@/features/users/api/users.keys'
import type { UpdateUserStatusInput } from '@/features/users/types/users.types'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useUpdateUserStatusMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.update(),
    mutationFn: (input: UpdateUserStatusInput) => updateUserStatus(input),
    meta: withMutationToast({
      error: 'Unable to update account status.',
      success: 'Account status updated.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)

      await queryClient.invalidateQueries({
        queryKey: usersKeys.lists(),
      })
    },
  })
}
