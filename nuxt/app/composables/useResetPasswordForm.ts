import type { FormSubmitEvent } from '@nuxt/ui'
import type { SetPasswordSchema } from '~/schemas/auth-flows'
import { useResetPassword } from '~/queries/session'

// Feature logic for the reset-password page (token from the URL). The SFC binds this and renders
// (including the missing-token guard).

export function useResetPasswordForm() {
  const route = useRoute()
  const { run } = useApiAction()
  const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
  const resetPassword = useResetPassword()
  const state = reactive<SetPasswordSchema>({ new_password: '', confirm_password: '' })
  const loading = ref(false)

  async function onSubmit(event: FormSubmitEvent<SetPasswordSchema>) {
    loading.value = true
    const res = await run(() => resetPassword.mutateAsync({ token: token.value, new_password: event.data.new_password }), {
      success: { title: 'Password reset', description: 'Sign in with your new password.' },
      error: 'Could not reset password'
    })
    if (res.ok) await navigateTo('/auth/login', { replace: true })
    loading.value = false
  }

  return { token, state, loading, onSubmit }
}
