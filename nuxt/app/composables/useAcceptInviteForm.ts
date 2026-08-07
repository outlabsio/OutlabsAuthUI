import type { FormSubmitEvent } from '@nuxt/ui'
import type { SetPasswordSchema } from '~/schemas/auth-flows'
import { useAcceptInvite } from '~/queries/session'

// Feature logic for the accept-invitation page (token from the URL). The SFC binds this and
// renders (including the missing-token guard).

export function useAcceptInviteForm() {
  const route = useRoute()
  const { run } = useApiAction()
  const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
  const acceptInvite = useAcceptInvite()
  const state = reactive<SetPasswordSchema>({ new_password: '', confirm_password: '' })
  const loading = ref(false)

  async function onSubmit(event: FormSubmitEvent<SetPasswordSchema>) {
    loading.value = true
    const res = await run(() => acceptInvite.mutateAsync({ token: token.value, new_password: event.data.new_password }), { error: 'Could not accept invitation' })
    if (res.ok) await navigateTo('/app/dashboard', { replace: true })
    loading.value = false
  }

  return { token, state, loading, onSubmit }
}
