import { useMutation } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { resetPassword } from '@/features/auth/api/reset-password'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useResetPasswordMutation() {
  return useMutation({
    mutationKey: authKeys.resetPassword(),
    mutationFn: resetPassword,
    meta: withMutationToast({
      error: 'Unable to reset your password.',
      success: 'Password reset. You can sign in now.',
    }),
  })
}
