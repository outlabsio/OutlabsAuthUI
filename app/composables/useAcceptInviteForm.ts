import type { FormSubmitEvent } from '@nuxt/ui'
import type { SetPasswordSchema } from '~/schemas/auth-flows'
import { describeAuthError } from '~/api/client'
import { useAcceptInvite, useLogout } from '~/queries/session'
import { passwordPolicyError } from '~/utils/auth-messages'
import { isWrongApplicationError, wrongApplicationMessage } from '~/utils/frontend-profile'
import { getRuntimeConfig } from '~/utils/runtime-config'

// Feature logic for the accept-invitation page (token from the URL). The SFC binds this and
// renders (including the missing-token guard).
// - A backend with invitations turned off gets an explanation instead of a form that fails.
// - A browser already signed in (as anyone) is asked before switching to the invited account.
// - The backend's password policy refusal lands on the password field; a dead link says so.
// It expects `ref="form"` on the UForm.

type InviteProblem = { title: string, description: string }

function inviteProblem(error: unknown): InviteProblem | null {
  if (isWrongApplicationError(error)) {
    return { title: 'This console cannot sign you in', description: wrongApplicationMessage(getRuntimeConfig().frontendProfileKey) }
  }
  const { status, data } = (error ?? {}) as { status?: number, data?: { error?: string } | null }
  if (status === 404) return { title: 'Invitations are turned off', description: 'This server no longer accepts invitations. Ask an administrator for another way in.' }
  if (status === 401 || data?.error === 'TOKEN_INVALID' || data?.error === 'TOKEN_EXPIRED') {
    return { title: 'This invitation link cannot be used', description: 'It has expired, was already used, or was replaced by a newer invitation. Ask an administrator to send it again.' }
  }
  return null
}

export function useAcceptInviteForm() {
  const route = useRoute()
  const { run } = useApiAction()
  const { user, capabilities } = useAuth()
  const { destination, withIntent } = useAuthIntent()
  const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
  const acceptInvite = useAcceptInvite()
  const logout = useLogout()
  const form = useTemplateRef<{ setErrors: (errors: Array<{ name: string, message: string }>) => void }>('form')
  const state = reactive<SetPasswordSchema>({ new_password: '', confirm_password: '' })
  const loading = ref(false)
  const signingOut = ref(false)
  const problem = ref<InviteProblem | null>(null)

  // Only an explicit `false` hides the form: an unknown config (older library) still tries.
  const invitationsOff = computed(() => capabilities.value?.features?.invitations === false)
  const signedInAs = computed(() => user.value?.email ?? '')

  async function onSubmit(event: FormSubmitEvent<SetPasswordSchema>) {
    loading.value = true
    problem.value = null
    const res = await run(() => acceptInvite.mutateAsync({ token: token.value, new_password: event.data.new_password }), {
      error: error => (passwordPolicyError(error) || inviteProblem(error) ? null : describeAuthError(error, 'Could not accept the invitation'))
    })
    if (res.ok) {
      await navigateTo(destination(), { replace: true })
    } else {
      const policy = passwordPolicyError(res.error)
      if (policy) form.value?.setErrors([{ name: 'new_password', message: policy }])
      problem.value = inviteProblem(res.error)
    }
    loading.value = false
  }

  async function signOut() {
    if (signingOut.value) return
    signingOut.value = true
    await run(() => logout.mutateAsync(), { error: 'Could not sign out' })
    signingOut.value = false
  }

  const signInTo = computed(() => withIntent('/auth/login'))

  return { token, state, loading, onSubmit, invitationsOff, signedInAs, signingOut, signOut, problem, signInTo }
}
