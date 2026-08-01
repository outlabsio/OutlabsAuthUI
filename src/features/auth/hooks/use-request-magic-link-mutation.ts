import { useMutation } from '@tanstack/react-query'

import { authKeys } from '@/features/auth/api/auth.keys'
import { requestMagicLink } from '@/features/auth/api/request-magic-link'
import { withMutationToast } from '@/lib/query/mutation-toast'

export function useRequestMagicLinkMutation() {
  return useMutation({
    mutationKey: authKeys.magicLinkRequest(),
    mutationFn: requestMagicLink,
    meta: withMutationToast({
      error: 'Unable to request a magic link.',
      success: 'If that email exists, a sign-in link has been sent.',
    }),
  })
}
