import type { FormSubmitEvent } from '@nuxt/ui'
import type { EmailRequestSchema } from '~/schemas/auth-flows'
import { useForgotPassword } from '~/queries/session'
import { describeAuthError } from '~/api/client'

// Feature logic for the forgot-password request. Always shows the "check your email" state on
// success (don't leak whether the account exists). The SFC binds this and renders.

export function useForgotPasswordForm() {
  const { run } = useApiAction()
  const forgotPassword = useForgotPassword()
  const state = reactive<Partial<EmailRequestSchema>>({ email: '' })
  const loading = ref(false)
  const sent = ref(false)

  async function onSubmit(event: FormSubmitEvent<EmailRequestSchema>) {
    loading.value = true
    const res = await run(() => forgotPassword.mutateAsync({ email: event.data.email }), {
      error: err => describeAuthError(err, 'Could not send reset link')
    })
    if (res.ok) sent.value = true
    loading.value = false
  }

  return { state, loading, sent, onSubmit }
}
