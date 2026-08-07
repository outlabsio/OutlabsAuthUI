import type { FormSubmitEvent } from '@nuxt/ui'
import type { EmailRequestSchema } from '~/schemas/auth-flows'
import { useRequestMagicLink, useVerifyMagicLink } from '~/queries/session'
import { describeAuthError, getApiErrorMessage } from '~/api/client'

// Feature logic for the magic-link flow — request a link, and (when the emailed link lands here
// with a ?token) verify it and sign in. The verify path shows an inline error, not a toast, so
// it keeps a small try/catch rather than going through `run`.

export function useMagicLinkForm() {
  const route = useRoute()
  const { run } = useApiAction()
  const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

  const requestMagicLink = useRequestMagicLink()
  const verifyMagicLink = useVerifyMagicLink()
  const state = reactive<Partial<EmailRequestSchema>>({ email: '' })
  const loading = ref(false)
  const sent = ref(false)
  const verifying = ref(false)
  const verifyError = ref('')

  onMounted(async () => {
    if (!token.value) return
    verifying.value = true
    try {
      await verifyMagicLink.mutateAsync({ token: token.value })
      await navigateTo('/app/dashboard', { replace: true })
    } catch (err) {
      verifyError.value = getApiErrorMessage(err)
    } finally {
      verifying.value = false
    }
  })

  async function onSubmit(event: FormSubmitEvent<EmailRequestSchema>) {
    loading.value = true
    const res = await run(() => requestMagicLink.mutateAsync({ email: event.data.email }), {
      error: err => describeAuthError(err, 'Could not send magic link')
    })
    if (res.ok) sent.value = true
    loading.value = false
  }

  return { token, state, loading, sent, verifying, verifyError, onSubmit }
}
