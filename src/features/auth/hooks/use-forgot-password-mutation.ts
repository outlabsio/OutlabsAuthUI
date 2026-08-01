import { useMutation } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { forgotPassword } from '@/features/auth/api/forgot-password'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useForgotPasswordMutation() {
  return useMutation({
    mutationKey: authKeys.forgotPassword(),
    mutationFn: forgotPassword,
    meta: withMutationToast({
      error: 'Unable to request a password reset.',
      success: 'If that email exists, a reset link has been sent.',
    }),
  })
}
