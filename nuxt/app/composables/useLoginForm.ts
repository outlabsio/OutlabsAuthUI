import type { FormSubmitEvent } from '@nuxt/ui'
import type { LoginSchema } from '~/schemas/login'
import { useLogin, useStartOAuthLogin } from '~/queries/session'
import type { RuntimeConfig } from '~/utils/runtime-config'

// Feature logic for the login page — password sign-in (navigate on success) + OAuth hand-off.
// Passwordless method availability comes from the discovered capabilities; OAuth providers from
// the deployment's runtime config. The SFC binds this and renders.

export function useLoginForm() {
  const route = useRoute()
  const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
  const { capabilities } = useAuth()
  const { run } = useApiAction()

  const signInDescription = computed(() => runtimeConfig.value?.signInDescription ?? '')
  const methods = computed(() => capabilities.value?.auth_methods)
  const oauthProviders = computed(() => runtimeConfig.value?.oauthProviders ?? [])

  // Surfaced when the provider bounces back to /auth/login?oauth_error=… (A5 parity).
  const oauthErrorMessage = computed(() => {
    const code = route.query.oauth_error
    if (typeof code !== 'string' || !code) return ''
    if (code === 'unknown_account') return 'That account isn\'t linked to an invitation. Ask an admin to invite you first.'
    return 'Sign-in with that provider could not be completed.'
  })
  function providerLabel(provider: string) {
    return provider.charAt(0).toUpperCase() + provider.slice(1)
  }

  const login = useLogin()
  const state = reactive<Partial<LoginSchema>>({ email: '', password: '' })
  const loading = ref(false)
  async function onSubmit(event: FormSubmitEvent<LoginSchema>) {
    loading.value = true
    const res = await run(() => login.mutateAsync(event.data), { error: 'Sign in failed' })
    if (res.ok) {
      // Only honor internal /app/ redirect targets (open-redirect guard).
      const target = route.query.redirect
      const redirect = typeof target === 'string' && target.startsWith('/app/') ? target : '/app/dashboard'
      await navigateTo(redirect, { replace: true })
    }
    loading.value = false
  }

  const startOAuth = useStartOAuthLogin()
  const oauthLoading = ref('')
  async function onOAuth(provider: string) {
    oauthLoading.value = provider
    const res = await run(() => startOAuth.mutateAsync(provider), { error: 'Could not start sign-in' })
    if (res.ok) window.location.href = res.data.authorization_url
    else oauthLoading.value = ''
  }

  return {
    signInDescription,
    methods,
    oauthProviders,
    oauthErrorMessage,
    providerLabel,
    state,
    loading,
    onSubmit,
    oauthLoading,
    onOAuth
  }
}
