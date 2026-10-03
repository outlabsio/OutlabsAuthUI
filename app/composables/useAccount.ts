import { useQuery, useQueryCache } from '@pinia/colada'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { LocationQuery } from 'vue-router'
import { mySocialAccountsQuery, SOCIAL_ACCOUNTS_ROOT } from '~/queries/account'
import { useForgotPassword } from '~/queries/session'
import { describeAuthError } from '~/api/client'
import { accountLinkFailure, oauthLinkErrorMessage, type AccountLinkFailure } from '~/utils/auth-messages'
import { cooldownKey } from '~/utils/request-cooldown'
import type { RecoveryResetOutcome } from '~/composables/useRecoveryFlow'

// The account area's frame (pages/app/account.vue): the tabs, and the one-shot notices a
// redirect can land with. Each tab has its own composable (useAccountProfile, useAccountPhone,
// useAccountSecurity, useAccountConnections, useMyAccess).

/**
 * Whether the Connected accounts tab has anything to show: providers to link (the backend mounts
 * oauth_associate and the deployment lists providers), accounts already linked, or a failed read
 * (so the error is visible rather than the tab silently missing).
 */
export function useConnectedAccountsAvailable() {
  const { linkableOauthProviders } = useAuthUiConfig()
  const accounts = useQuery(mySocialAccountsQuery)
  const available = computed(() =>
    linkableOauthProviders.value.length > 0
    || (accounts.data.value?.length ?? 0) > 0
    || accounts.status.value === 'error')
  return { available, accounts }
}

const CONNECTIONS_PATH = '/app/account/connections'

/**
 * A failed account link the associate callback redirected back with (F-104), kept until it is
 * dismissed or the account area is left: useAccount reads it from the address, Connected
 * accounts (or, where that tab does not exist, the account frame) shows it.
 */
export function useAccountLinkNotice() {
  const failure = useState<AccountLinkFailure | null>('account:link-notice', () => null)
  const { providerLabel } = useAuthUiConfig()
  const message = computed(() => (failure.value
    ? oauthLinkErrorMessage(failure.value.code, failure.value.provider ? providerLabel(failure.value.provider) : null)
    : null))
  return {
    failure,
    message,
    dismiss: () => {
      failure.value = null
    }
  }
}

/** "Send me a reset link" for the signed-in actor, shared by the recovery notice and Security. */
export function useAccountResetLink() {
  const { user } = useAuth()
  const { run } = useApiAction()
  const forgotPassword = useForgotPassword()
  const sending = ref(false)
  const cooldown = useRequestCooldown(() => (user.value?.email ? cooldownKey('reset-link', user.value.email) : null))
  async function send(): Promise<boolean> {
    const email = user.value?.email
    if (!email || cooldown.active.value || sending.value) return false
    sending.value = true
    const res = await run(() => forgotPassword.mutateAsync({ email }), {
      success: { title: 'Reset link sent', description: `Check ${email} for a link to set a new password.` },
      error: err => describeAuthError(err, 'Could not send the reset link')
    })
    if (res.ok) cooldown.start()
    else cooldown.startFromError(res.error)
    sending.value = false
    return res.ok
  }
  return { send, sending, cooldown: cooldown.remaining }
}

export function useAccount() {
  const { user } = useAuth()
  const queryCache = useQueryCache()
  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  const { providerLabel } = useAuthUiConfig()
  const { available: connectionsAvailable, accounts: linkedAccounts } = useConnectedAccountsAvailable()

  // Tabs (dashboard template settings pattern): Profile | Security | Connected accounts | Access.
  // Security holds the password and the sessions; Connected accounts only when there is one to
  // show or link (F-194).
  const tabs = computed<NavigationMenuItem[]>(() => [
    { label: 'Profile', icon: 'i-lucide-user', to: '/app/account', exact: true },
    { label: 'Security', icon: 'i-lucide-shield', to: '/app/account/security' },
    ...(connectionsAvailable.value ? [{ label: 'Connected accounts', icon: 'i-lucide-link', to: '/app/account/connections' }] : []),
    { label: 'Access', icon: 'i-lucide-key-round', to: '/app/account/access' }
  ])

  // --- Phone-OTP recovery landing (?recover=password&reset=sent|failed|none) ---
  // Recovery signs the user in with a one-time code and tries to email a reset link; the
  // notice says what actually happened and can send the link from here.
  const recovery = ref<{ reset: RecoveryResetOutcome | 'unknown' } | null>(null)
  const resetLink = useAccountResetLink()
  async function onSendResetLink() {
    if (await resetLink.send()) recovery.value = { reset: 'sent' }
  }
  const recoveryNotice = computed(() => {
    if (!recovery.value) return null
    const email = user.value?.email
    const reset = recovery.value.reset
    if (reset === 'sent') {
      return { color: 'info' as const, icon: 'i-lucide-mail-check', canSend: false, description: `We emailed a password-reset link to ${email}. Open it to set a new password.` }
    }
    if (reset === 'none') {
      return { color: 'warning' as const, icon: 'i-lucide-triangle-alert', canSend: false, description: 'Your account has no email address, so a reset link can\'t be sent. Ask an administrator to set a new password for you.' }
    }
    return {
      color: 'warning' as const,
      icon: 'i-lucide-triangle-alert',
      canSend: true,
      description: reset === 'failed'
        ? 'We could not email you a password-reset link. Send one now to set a new password.'
        : 'To set a new password, send yourself a password-reset link.'
    }
  })

  // --- Account-link failure (?link_error=<code>&provider=<name>, F-104) ---
  // The associate callback lands on the deployment's account landing (/app/account in the
  // example profile, possibly another tab). Connected accounts says what failed and offers the
  // next step; where that tab does not exist (no providers to link and none linked) the notice
  // shows here, above every tab. Whether the tab exists is known once the providers offer a link
  // or the linked accounts have answered.
  const linkNotice = useAccountLinkNotice()
  const connectionsKnown = computed(() => connectionsAvailable.value || linkedAccounts.status.value !== 'pending')
  const frameLinkNotice = computed(() => (linkNotice.message.value && connectionsKnown.value && !connectionsAvailable.value
    ? linkNotice.message.value
    : null))
  // The cleaned query to open Connected accounts with, while a landing on another tab waits for
  // the tabs to be known.
  const pendingConnections = ref<LocationQuery | null>(null)
  watch([pendingConnections, connectionsKnown], ([query, known]) => {
    if (!query || !known) return
    pendingConnections.value = null
    if (connectionsAvailable.value && route.path !== CONNECTIONS_PATH) void router.replace({ path: CONNECTIONS_PATH, query })
  })
  onBeforeUnmount(linkNotice.dismiss)

  // One-shot URL notices, read once and removed from the address bar so a reload or a shared
  // link does not repeat them (a watchEffect + replace would re-fire on its own navigation):
  // - ?linked=<provider>: the associate callback linked a provider;
  // - ?link_error=<code>&provider=<name>: linking failed (above);
  // - ?recover=password: phone-OTP recovery landed here.
  onMounted(() => {
    const { linked, link_error: linkError, recover, reset, ...rest } = route.query
    if (typeof linked === 'string' && linked) {
      toast.add({ title: `${providerLabel(linked)} account linked`, color: 'success', icon: 'i-lucide-check' })
      queryCache.invalidateQueries({ key: [SOCIAL_ACCOUNTS_ROOT] })
    }
    if (linkError != null) {
      const failure = accountLinkFailure(linkError, rest.provider)
      delete rest.provider
      if (failure) {
        linkNotice.failure.value = failure
        if (route.path !== CONNECTIONS_PATH) pendingConnections.value = rest
      }
    }
    if (recover === 'password') {
      recovery.value = { reset: reset === 'sent' || reset === 'failed' || reset === 'none' ? reset : 'unknown' }
    }
    if (linked != null || linkError != null || recover != null || reset != null) void router.replace({ query: rest })
  })

  return {
    tabs,
    recoveryNotice,
    sendingResetLink: resetLink.sending,
    resetLinkCooldown: resetLink.cooldown,
    onSendResetLink,
    dismissRecovery: () => {
      recovery.value = null
    },
    linkNotice: frameLinkNotice,
    dismissLinkNotice: linkNotice.dismiss
  }
}
