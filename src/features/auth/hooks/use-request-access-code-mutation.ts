import { useMutation } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { requestAccessCode } from '@/features/auth/api/request-access-code'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRequestAccessCodeMutation() {
  return useMutation({
    mutationKey: authKeys.accessCodeRequest(),
    mutationFn: requestAccessCode,
    meta: withMutationToast({
      error: 'Unable to request an access code.',
      success: 'If that email exists, a sign-in code has been sent.',
    }),
  })
}
