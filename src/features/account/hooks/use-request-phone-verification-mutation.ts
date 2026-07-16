import { useMutation } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { requestPhoneVerification } from '@/features/account/api/request-phone-verification'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRequestPhoneVerificationMutation() {
  return useMutation({
    mutationKey: accountKeys.requestPhoneVerification(),
    mutationFn: () => requestPhoneVerification(),
    meta: withMutationToast({
      error: 'Unable to send a verification code.',
      success: 'Verification code sent.',
    }),
  })
}
