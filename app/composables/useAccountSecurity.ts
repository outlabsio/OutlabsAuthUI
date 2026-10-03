import { useQuery } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  mySessionsQuery,
  useChangePassword,
  useRevokeAllSessions,
  useRevokeOtherSessions,
  useRevokeSession,
  type RevokeOtherSessionsOutcome
} from '~/queries/account'
import type { ChangePasswordSchema } from '~/schemas/account'
import type { UserSession } from '~/types/account'
import { changePasswordFieldErrors } from '~/utils/account'
import { sessionDeviceLabel } from '~/utils/user-agent'

// The Security tab: the password and the sessions.
//
// - A password change ends every session of the account on the server, this one included; the
//   console signs this browser in again with the new password, or signs it out with the reason
//   when that fails (F-029). Field answers (wrong current password, the server's password
//   policy) land on their fields, never only in a toast (F-097). An account that cannot sign in
//   with a password at all (the server has password sign-in off) has no password card; one that
//   cannot remember its current password gets a reset link (F-098).
// - Sessions: the server marks this browser's row (`is_current`), which offers Sign out; other
//   rows are revoked after a confirmation naming the device. "Sign out other devices" ends every
//   other session and keeps this one; "Sign out everywhere" confirms that it also ends this
//   session, then signs this tab out (F-030, F-094). When the server cannot tell which session is
//   this browser's, Sign out other devices explains it in the card (`sessionNotBound`) and offers
//   Sign out everywhere instead.

const EMPTY_PASSWORD: ChangePasswordSchema = { current_password: '', new_password: '', confirm_password: '' }

export function useAccountSecurity() {
  const { user } = useAuth()
  const { run } = useApiAction()
  const toast = useToast()
  const { passwordEnabled } = useAuthUiConfig()
  const { signOut, signingOut } = useSignOut()

  // --- Password ---
  const passwordForm = useTemplateRef<ActionForm>('passwordForm')
  const passwordState = reactive<ChangePasswordSchema>({ ...EMPTY_PASSWORD })
  // Bound as the UForm's key: a successful change remounts the form empty. Resetting the state
  // alone is not enough: UForm validates a typed-in field 300 ms after its last input, so when the
  // change completes sooner (a password manager fills and submits at once) those validations
  // would run on the emptied fields and show "required" errors next to the success toast.
  // Remounting drops them, with the form's errors and its record of visited fields.
  const passwordFormKey = ref(0)
  const changePassword = useChangePassword()
  const changingPassword = ref(false)

  async function onChangePassword(event: FormSubmitEvent<ChangePasswordSchema>) {
    const email = user.value?.email
    if (!email || changingPassword.value) return
    changingPassword.value = true
    const res = await run(() => changePassword.mutateAsync({
      email,
      current_password: event.data.current_password,
      new_password: event.data.new_password
    }), {
      form: passwordForm,
      // A wrong current password and the server's password policy are field answers: they land
      // on Current password / New password (the policy issue is not also mapped from its path).
      fieldErrors: changePasswordFieldErrors,
      fieldMap: { password: null, new_password: null },
      error: err => (changePasswordFieldErrors(err).length ? null : 'Could not change password')
    })
    changingPassword.value = false
    if (!res.ok) return
    Object.assign(passwordState, EMPTY_PASSWORD)
    passwordFormKey.value++
    if (res.data.signedIn) {
      toast.add({ title: 'Password changed', description: 'Your other devices were signed out. You are still signed in here.', color: 'success', icon: 'i-lucide-check' })
    }
    // Otherwise this tab is already on its way to sign-in, which explains the change.
  }

  const resetLink = useAccountResetLink()

  // --- Sessions ---
  const {
    data: sessions,
    status: sessionsStatus,
    error: sessionsError,
    isLoading: sessionsFetching,
    refetch: refetchSessions
  } = useQuery(mySessionsQuery)
  const sessionRows = computed<UserSession[]>(() => sessions.value ?? [])
  // Every session but this browser's. When the server marks none (the access token that listed
  // them names no session), all of them: Sign out other devices then renews and asks again.
  const otherSessions = computed(() => sessionRows.value.filter(session => !session.is_current))
  const revokeSession = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()
  const revokeAll = useRevokeAllSessions()

  const deviceLabel = (session: UserSession) => sessionDeviceLabel(session)

  const revoke = useConfirmAction<UserSession>({
    describe: session => ({
      title: `Revoke session ${deviceLabel(session)}`,
      effects: [
        'That device can no longer renew its session. It is signed out when its current access token expires.',
        'Its user signs in again to continue there.'
      ],
      confirmLabel: 'Revoke session'
    }),
    action: session => revokeSession.mutateAsync(session.id),
    success: 'Session revoked',
    error: 'Could not revoke session'
  })

  const signOutEverywhere = useConfirmAction<true>({
    describe: () => ({
      title: 'Sign out everywhere',
      description: 'End every session of your account, on every device.',
      effects: [
        'This browser is signed out too: you go to the sign-in page.',
        'Other devices can no longer renew their sessions and are signed out when their current access tokens expire.',
        'API keys are not affected.'
      ],
      confirmLabel: 'Sign out everywhere'
    }),
    // On success the query layer signs this tab out (see useRevokeAllSessions).
    action: () => revokeAll.mutateAsync(),
    error: 'Could not sign out everywhere'
  })

  // Sign out other devices: only when there is another session to end.
  const canSignOutOthers = computed(() => sessionsStatus.value === 'success' && otherSessions.value.length > 0)
  // The server could not keep this browser's session while ending the others; shown in the card.
  const sessionNotBound = ref(false)
  const signOutOthers = useConfirmAction<true, RevokeOtherSessionsOutcome>({
    describe: () => ({
      title: 'Sign out other devices',
      description: 'End every other session of your account. This browser stays signed in.',
      effects: [
        'Other browsers and devices can no longer renew their sessions and are signed out when their current access tokens expire.',
        'API keys are not affected.'
      ],
      confirmLabel: 'Sign out other devices'
    }),
    action: () => {
      sessionNotBound.value = false
      return revokeOthers.mutateAsync()
    },
    error: 'Could not sign out other devices',
    onSuccess: (outcome) => {
      if (outcome === 'session_not_bound') {
        sessionNotBound.value = true
        return
      }
      toast.add({ title: 'Signed out of other devices', color: 'success', icon: 'i-lucide-check' })
    }
  })

  return {
    passwordEnabled,
    passwordState,
    passwordFormKey,
    changingPassword,
    onChangePassword,
    sendingResetLink: resetLink.sending,
    resetLinkCooldown: resetLink.cooldown,
    onSendResetLink: () => void resetLink.send(),
    hasEmail: computed(() => Boolean(user.value?.email)),
    sessionRows,
    sessionsStatus,
    sessionsError,
    sessionsFetching,
    refetchSessions,
    revoke,
    canSignOutOthers,
    signOutOthers,
    sessionNotBound,
    dismissSessionNotBound: () => {
      sessionNotBound.value = false
    },
    signOutEverywhere,
    signOut,
    signingOut
  }
}
