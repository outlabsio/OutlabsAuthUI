import { useMutation, useQueryClient } from '@tanstack/react-query'

import { resetUserPassword } from '@/features/users/api/reset-user-password'
import { usersKeys } from '@/features/users/api/users.keys'
import type { ResetUserPasswordInput } from '@/features/users/types/users.types'

export function useResetUserPasswordMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: usersKeys.all,
    mutationFn: (input: ResetUserPasswordInput) => resetUserPassword(input),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: usersKeys.detail(variables.userId),
      })
    },
  })
}
