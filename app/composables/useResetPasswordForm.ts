import type { FormSubmitEvent } from '@nuxt/ui'
import type { SetPasswordSchema } from '~/schemas/auth-flows'
import { describeAuthError } from '~/api/client'
import { useResetPassword } from '~/queries/session'
import { passwordPolicyError } from '~/utils/auth-messages'

// Feature logic for the reset-password page (token from the URL). The SFC binds this and renders
// (including the missing-token guard). The backend's password-policy refusal lands on the
// password field; a dead link says so inline with a way to request a new one. Signed-in users
// may open this page (phone recovery emails the link to a signed-in user). It expects
// `ref="form"` on the UForm.

export function useResetPasswordForm() {
  const route = useRoute()
  const { run } = useApiAction()
  const { withIntent } = useAuthIntent()
  const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
  const resetPassword = useResetPassword()
  const form = useTemplateRef<{ setErrors: (errors: Array<{ name: string, message: string }>) => void }>('form')
  const state = reactive<SetPasswordSchema>({ new_password: '', confirm_password: '' })
  const loading = ref(false)
  const linkProblem = ref('')

  async function onSubmit(event: FormSubmitEvent<SetPasswordSchema>) {
    loading.value = true
    linkProblem.value = ''
    const res = await run(() => resetPassword.mutateAsync({ token: token.value, new_password: event.data.new_password }), {
      success: { title: 'Password reset', description: 'Sign in with your new password.' },
      error: (error) => {
        const status = (error as { status?: number }).status
        if (passwordPolicyError(error) || status === 401) return null
        return describeAuthError(error, 'Could not reset the password')
      }
    })
    if (res.ok) {
      await navigateTo(withIntent('/auth/login'), { replace: true })
    } else {
      const policy = passwordPolicyError(res.error)
      const status = (res.error as { status?: number }).status
      if (policy) form.value?.setErrors([{ name: 'new_password', message: policy }])
      else if (status === 401) linkProblem.value = 'This reset link has expired or was already used. Request a new one.'
    }
    loading.value = false
  }

  const requestLinkTo = computed(() => withIntent('/auth/recovery'))
  // A way back for someone who opened the link by mistake (or remembered their password).
  const signInTo = computed(() => withIntent('/auth/login'))

  return { token, state, loading, onSubmit, linkProblem, requestLinkTo, signInTo }
}
