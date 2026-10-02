import type { FormSubmitEvent } from '@nuxt/ui'
import type { RegisterSchema } from '~/schemas/auth-flows'
import { describeAuthError } from '~/api/client'
import { beginOAuthSignIn } from '~/auth/pending-oauth'
import { useLogin, useRegister, useStartOAuthLogin } from '~/queries/session'
import { passwordPolicyError } from '~/utils/auth-messages'

// Feature logic for the signup page (F3) — register, then auto sign in with the same
// credentials (register returns the user, not tokens). Method-buttons pattern like sign-in:
// OAuth providers as peer buttons, the email form unfolds (or renders directly when no
// providers are configured). The page only exists when the deployment surfaces signup
// (`authUi.signup`): its route middleware sends everyone else to sign-in before anything
// renders, and a submit is refused here too. It expects `ref="form"` on the register UForm.

export function useSignupForm() {
  const { signupEnabled, oauthProviders, phoneEnabled } = useAuthUiConfig()
  const { run } = useApiAction()
  const { redirect, destination, withIntent } = useAuthIntent()
  const register = useRegister()
  const login = useLogin()

  const state = reactive<Partial<RegisterSchema>>({
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    confirm_password: ''
  })
  const loading = ref(false)

  async function onSubmit(event: FormSubmitEvent<RegisterSchema>, form?: { setErrors: (errors: Array<{ name: string, message: string }>) => void } | null) {
    if (!signupEnabled.value) return
    loading.value = true
    const res = await run(() => register.mutateAsync({
      email: event.data.email,
      password: event.data.password,
      first_name: event.data.first_name || undefined,
      last_name: event.data.last_name || undefined
    }), {
      error: error => (passwordPolicyError(error) ? null : describeAuthError(error, 'Could not create account'))
    })
    if (res.ok) {
      const signedIn = await run(() => login.mutateAsync({ email: event.data.email, password: event.data.password }), {
        error: 'Account created — sign in failed'
      })
      if (signedIn.ok) await navigateTo(destination(), { replace: true })
      else await navigateTo(withIntent('/auth/login'), { replace: true })
    } else {
      const policy = passwordPolicyError(res.error)
      if (policy) form?.setErrors([{ name: 'password', message: policy }])
    }
    loading.value = false
  }

  // OAuth signup — same provider hand-off as sign-in (the backend associates-or-creates).
  const startOAuth = useStartOAuthLogin()
  const oauthLoading = ref('')
  async function onOAuth(provider: string) {
    oauthLoading.value = provider
    const res = await run(() => startOAuth.mutateAsync(provider), { error: 'Could not start sign-up' })
    if (!res.ok) {
      oauthLoading.value = ''
      return
    }
    // The provider round-trip drops ?redirect; the callback page restores it. The pending
    // marker is what lets the callback accept the session it brings back (login CSRF).
    beginOAuthSignIn(redirect.value)
    window.location.href = res.data.authorization_url
  }
  // Back from the provider may restore this page from the back/forward cache mid-loading.
  onPageRestore(() => {
    oauthLoading.value = ''
  })

  const signInTo = computed(() => withIntent('/auth/login'))

  // Phone sign-in codes are promised only where the deployment offers them (the same gate as
  // the Account phone card, which otherwise calls the number a contact number).
  const description = computed(() => (phoneEnabled.value
    ? 'Sign up with your email. You can add a phone number for sign-in codes later.'
    : 'Sign up with your email.'))

  return { description, oauthProviders, oauthLoading, onOAuth, state, loading, onSubmit, signInTo }
}
