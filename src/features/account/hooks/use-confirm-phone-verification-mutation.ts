import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import {
  confirmPhoneVerification,
  type ConfirmPhoneVerificationInput,
} from '@/features/account/api/confirm-phone-verification'
import { authKeys } from '@/features/auth/api/auth.keys'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useConfirmPhoneVerificationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: accountKeys.confirmPhoneVerification(),
    mutationFn: (input: ConfirmPhoneVerificationInput) =>
      confirmPhoneVerification(input),
    meta: withMutationToast({
      error: 'Unable to verify this phone number.',
      success: 'WhatsApp phone verified.',
    }),
    onSuccess: async (user) => {
      queryClient.setQueryData(authKeys.session(), user)

      await queryClient.invalidateQueries({
        queryKey: authKeys.session(),
      })
    },
  })
}
