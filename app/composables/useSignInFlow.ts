import type { FormSubmitEvent } from '@nuxt/ui'
import type { AuthIdentifierSubmit, EmailPasswordSchema } from '~/schemas/auth-flows'
import { emailPasswordSchema, normalizePhone } from '~/schemas/auth-flows'
import { describeAuthError } from '~/api/client'
import { isWrongApplicationError, wrongApplicationMessage } from '~/utils/frontend-profile'
import { getRuntimeConfig } from '~/utils/runtime-config'
import { beginOAuthSignIn, forgetPendingOAuth } from '~/auth/pending-oauth'
import {
  clearPendingChallenge,
  readPendingChallenge,
  savePendingChallenge,
  type PendingChallenge
} from '~/auth/pending-challenge'
import { accessCodeChannelLabel, oauthErrorMessage, type AuthMessage } from '~/utils/auth-messages'
import { cooldownKey } from '~/utils/request-cooldown'
import {
  useLogin,
  useRequestAccessCode,
  useRequestMagicLink,
  useStartOAuthLogin,
  useVerifyAccessCode
} from '~/queries/session'
import type { AccessCodeChannel } from '~/types/auth'

// Unified sign-in flow (the state machine behind /auth/login and /auth/access-code),
// method-buttons pattern: OAuth providers, email, and phone are PEERS — each a button; the
// chosen one expands in place (email unfolds into the email+password form, phone into the
// phone identifier). Email-only deployments skip the buttons and render the form directly.
//
// Steps live in the URL (?step=channel|code|link-sent), so Back/Forward move between them, and
// what a step shows (the phone, the code's destination, the link's email) is kept for this tab
// in sessionStorage, so a reload never forces a new request. Requests are rate-limited per
// identifier by the backend, so every send starts a cooldown (useRequestCooldown) and a 429
// starts the wait the API asked for. Every token-returning path funnels through
// queries/session.ts (finalizeAuth); this composable only orchestrates. The SFC binds and
// renders.

export type SignInStep = 'methods' | 'channel' | 'otp' | 'magic-link-sent'

function isValidEmail(value: string | undefined) {
  return emailPasswordSchema.shape.email.safeParse(value ?? '').success
}

export function useSignInFlow() {
  const route = useRoute()
  const router = useRouter()
  const { run } = useApiAction()
  const { redirect, destination } = useAuthIntent()
  const {
    passwordEnabled,
    magicLinkEnabled,
    accessCodeEnabled,
    phoneEnabled,
    phoneChannels,
    oauthProviders,
    otpLength
  } = useAuthUiConfig()
  // The methods layout depends on discovered capabilities — the SFC holds rendering until
  // the query resolves (data or error) so buttons never swap in under a typing user.
  const { capabilitiesResolved } = useAuth()

  // ── Pending step state (this tab) ──
  const pending = ref<PendingChallenge | null>(readPendingChallenge('sign-in'))
  function remember(next: Omit<PendingChallenge, 'savedAt'>) {
    pending.value = savePendingChallenge('sign-in', next)
  }
  function forget() {
    clearPendingChallenge('sign-in')
    pending.value = null
  }

  const { step, goTo } = useUrlStep<SignInStep>({
    steps: { 'methods': null, 'channel': 'channel', 'otp': 'code', 'magic-link-sent': 'link-sent' },
    initial: 'methods',
    available: (candidate) => {
      if (candidate === 'channel') return Boolean(pending.value?.phone)
      if (candidate === 'otp') return Boolean(pending.value?.code)
      if (candidate === 'magic-link-sent') return Boolean(pending.value?.email)
      return true
    }
  })
  useAuthStepFocus(step, { skip: next => next === 'otp' })

  // Email-only deployments (no OAuth providers, no phone OTP) render the form directly —
  // no method buttons to read past.
  const emailOnly = computed(() => oauthProviders.value.length === 0 && !phoneEnabled.value)

  // ── Email method: identifier + password on one unfolded form ──
  // Email and phone are one choice, not two independent disclosures. Keeping a single
  // active method also prevents both UCollapsibles from opening during capability
  // hydration or when a user switches methods quickly. A link that asks for the email method
  // (?method=email, e.g. "Request a new link" on a failed magic link) opens it straight away.
  const activeMethod = ref<'email' | 'phone' | undefined>(route.query.method === 'email' ? 'email' : undefined)
  const emailOpen = computed({
    get: () => activeMethod.value === 'email',
    set: (open: boolean) => {
      activeMethod.value = open ? 'email' : activeMethod.value === 'email' ? undefined : activeMethod.value
    }
  })
  const phoneOpen = computed({
    get: () => activeMethod.value === 'phone',
    set: (open: boolean) => {
      activeMethod.value = open ? 'phone' : activeMethod.value === 'phone' ? undefined : activeMethod.value
    }
  })
  const emailState = reactive<Partial<EmailPasswordSchema>>({ email: '', password: '' })
  const login = useLogin()
  const passwordLoading = ref(false)

  // A frontend-profile rejection (403 wrong_application) is a deployment/config problem, not
  // a typo: explain it inline, naming the configured key, and skip the toast so the user
  // sees one message. Every other failure keeps its toast.
  const applicationError = ref('')
  function noteSignInFailure(error: unknown) {
    applicationError.value = isWrongApplicationError(error)
      ? wrongApplicationMessage(getRuntimeConfig().frontendProfileKey)
      : ''
  }

  async function onEmailSubmit(event: FormSubmitEvent<EmailPasswordSchema>) {
    passwordLoading.value = true
    applicationError.value = ''
    const res = await run(() => login.mutateAsync({ email: event.data.email, password: event.data.password }), {
      error: error => (isWrongApplicationError(error) ? null : describeAuthError(error, 'Sign in failed'))
    })
    if (res.ok) await finish()
    else noteSignInFailure(res.error)
    passwordLoading.value = false
  }

  // ── Requests (codes and links), each behind a per-identifier cooldown ──
  const requestMagicLink = useRequestMagicLink()
  const requestAccessCode = useRequestAccessCode()
  const methodLoading = ref('')
  // Where the backend should send the user after a passwordless sign-in: the page they were
  // headed to, as a relative path (the backend resolves it onto the frontend profile's origin).
  const redirectUrl = () => (redirect.value ? { redirect_url: redirect.value } : {})

  const typedEmail = computed(() => (isValidEmail(emailState.email) ? emailState.email!.trim() : ''))
  const magicLinkCooldown = useRequestCooldown(() => (typedEmail.value ? cooldownKey('magic-link', typedEmail.value) : null))
  const emailCodeCooldown = useRequestCooldown(() => (typedEmail.value ? cooldownKey('code:email', typedEmail.value) : null))

  async function requestLink(email: string): Promise<boolean> {
    const key = cooldownKey('magic-link', email)
    const res = await run(() => requestMagicLink.mutateAsync({ email, ...redirectUrl() }), {
      error: error => describeAuthError(error, 'Could not send the sign-in link')
    })
    if (res.ok) startRequestCooldown(key)
    else startRequestCooldownFromError(key, res.error)
    return res.ok
  }

  async function requestCode(channel: AccessCodeChannel, identifier: string): Promise<boolean> {
    const key = cooldownKey(`code:${channel}`, identifier)
    const target = channel === 'email' ? { email: identifier } : { phone: identifier }
    const res = await run(() => requestAccessCode.mutateAsync({ ...target, channel, ...redirectUrl() }), {
      error: error => describeAuthError(error, 'Could not send the code')
    })
    if (res.ok) startRequestCooldown(key)
    else startRequestCooldownFromError(key, res.error)
    return res.ok
  }

  async function sendMagicLink(email: string) {
    if (magicLinkCooldown.active.value) return
    methodLoading.value = 'magic-link'
    if (await requestLink(email)) {
      remember({ email })
      await goTo('magic-link-sent')
    }
    methodLoading.value = ''
  }

  async function sendEmailCode(email: string) {
    if (emailCodeCooldown.active.value) return
    methodLoading.value = 'email-code'
    if (await requestCode('email', email)) {
      remember({ code: { channel: 'email', identifier: email } })
      await goTo('otp')
    }
    methodLoading.value = ''
  }

  // ── Phone method: identifier → channel choice → OTP ──
  const phone = computed(() => pending.value?.phone ?? '')
  const channelCooldowns = {
    whatsapp: useRequestCooldown(() => (phone.value ? cooldownKey('code:whatsapp', phone.value) : null)),
    sms: useRequestCooldown(() => (phone.value ? cooldownKey('code:sms', phone.value) : null))
  }
  function channelCooldown(channel: AccessCodeChannel) {
    return channel === 'email' ? 0 : channelCooldowns[channel].remaining.value
  }

  async function onPhoneIdentifierSubmit(input: AuthIdentifierSubmit) {
    // The phone panel is phone-only (schema-validated) — normalize and pick a channel.
    if (!phoneEnabled.value) return // the phone button only renders when enabled
    remember({ phone: normalizePhone(input.identifier, input.dialCode, input.countryCode) })
    await goTo('channel')
  }

  async function sendPhoneCode(selected: AccessCodeChannel) {
    if (!phone.value || channelCooldown(selected) > 0) return
    methodLoading.value = selected
    if (await requestCode(selected, phone.value)) {
      remember({ phone: phone.value, code: { channel: selected, identifier: phone.value } })
      await goTo('otp')
    }
    methodLoading.value = ''
  }

  // ── "I already have a code" (/auth/access-code): straight to the code step ──
  async function enterCode(code: { channel: AccessCodeChannel, identifier: string }) {
    remember(code.channel === 'email' ? { code } : { phone: code.identifier, code })
    await goTo('otp')
  }

  // ── OTP step ──
  const verifyAccessCode = useVerifyAccessCode()
  const digits = ref<number[]>([])
  const code = computed(() => digits.value.join(''))
  const verifying = ref(false)
  const resending = ref(false)
  const pendingCode = computed(() => pending.value?.code ?? null)
  const resendCooldown = useRequestCooldown(() => (pendingCode.value ? cooldownKey(`code:${pendingCode.value.channel}`, pendingCode.value.identifier) : null))
  const verifyCooldown = useRequestCooldown(() => (pendingCode.value ? cooldownKey('verify', pendingCode.value.identifier) : null))

  // Anti-enumeration: the backend answers the same whether or not the identifier has an
  // account, so the copy never claims a code was sent.
  const sentTo = computed(() => {
    const target = pendingCode.value
    if (!target) return ''
    if (target.channel === 'email') return `If ${target.identifier} has an account here, we sent it a ${otpLength.value}-digit code.`
    return `If ${target.identifier} is a verified number on an account here, we sent a ${otpLength.value}-digit code by ${accessCodeChannelLabel(target.channel, 'inline')}.`
  })

  // Called by the verify button and the OTP input's @complete (auto-submit on the last digit).
  async function onVerify() {
    const target = pendingCode.value
    if (!target || code.value.length < otpLength.value || verifying.value || verifyCooldown.active.value) return
    verifying.value = true
    const input = target.channel === 'email'
      ? { email: target.identifier, channel: target.channel, code: code.value }
      : { phone: target.identifier, channel: target.channel, code: code.value }
    applicationError.value = ''
    const res = await run(() => verifyAccessCode.mutateAsync(input), {
      error: error => (isWrongApplicationError(error) ? null : describeAuthError(error, 'Invalid code'))
    })
    if (res.ok) {
      await finish(res.data.nextUrl)
    } else {
      digits.value = []
      verifyCooldown.startFromError(res.error)
      noteSignInFailure(res.error)
    }
    verifying.value = false
  }

  async function resendCode() {
    const target = pendingCode.value
    if (!target || resendCooldown.active.value) return
    resending.value = true
    await requestCode(target.channel, target.identifier)
    resending.value = false
  }

  // ── Magic link sent ──
  const linkEmail = computed(() => pending.value?.email ?? '')
  const linkCooldown = useRequestCooldown(() => (linkEmail.value ? cooldownKey('magic-link', linkEmail.value) : null))
  async function resendMagicLink() {
    if (!linkEmail.value || linkCooldown.active.value) return
    resending.value = true
    await requestLink(linkEmail.value)
    resending.value = false
  }

  async function backToMethods() {
    digits.value = []
    forget()
    await goTo('methods')
  }

  // ── OAuth ──
  const startOAuth = useStartOAuthLogin()
  const oauthLoading = ref('')

  async function onOAuth(provider: string) {
    oauthError.value = null
    oauthLoading.value = provider
    const res = await run(() => startOAuth.mutateAsync(provider), { error: 'Could not start sign-in' })
    if (!res.ok) {
      oauthLoading.value = ''
      return
    }
    // The provider round-trip drops ?redirect; the callback page restores it. The pending
    // marker is what lets the callback accept the session it brings back (login CSRF).
    beginOAuthSignIn(redirect.value)
    window.location.href = res.data.authorization_url
  }

  // Back from the provider can restore this page from the back/forward cache with the button
  // still loading (and so disabled): reset every in-flight marker.
  onPageRestore(() => {
    oauthLoading.value = ''
    methodLoading.value = ''
    passwordLoading.value = false
  })

  // The provider bounced back to /auth/login?oauth_error=<code>: explain that code, then drop
  // it from the URL so a retry (or a reload) starts clean. The alert is dismissible.
  const initialOAuthError = route.query.oauth_error
  const oauthError = ref<AuthMessage | null>(
    typeof initialOAuthError === 'string' && initialOAuthError
      ? oauthErrorMessage(initialOAuthError, getRuntimeConfig().frontendProfileKey)
      : null
  )
  function dismissOAuthError() {
    oauthError.value = null
  }

  onMounted(() => {
    const { oauth_error: _oauthError, method: _method, ...rest } = route.query
    // The provider answered with an error: that attempt is over, so its callback marker goes.
    if (_oauthError != null) forgetPendingOAuth()
    // A ?step= this tab cannot show (nothing pending, e.g. an old bookmark) is dropped too.
    // ?method= has done its job once read, so a reload starts from the method buttons.
    const staleStep = route.query.step != null && step.value === 'methods'
    if (_oauthError != null || _method != null || staleStep) {
      const { step: _step, ...query } = rest
      void router.replace({ query: staleStep ? query : rest })
    }
  })

  // Signed in: drop the stored step and open the page the user was headed to. The step state
  // itself stays until the page is left, so the code step does not flash back to the methods.
  async function finish(nextUrl?: string | null) {
    clearPendingChallenge('sign-in')
    await navigateTo(destination(nextUrl), { replace: true })
  }

  return {
    step,
    capabilitiesResolved,
    emailOnly,
    emailOpen,
    phoneOpen,
    emailState,
    passwordLoading,
    applicationError,
    onEmailSubmit,
    methodLoading,
    magicLinkCooldown: magicLinkCooldown.remaining,
    emailCodeCooldown: emailCodeCooldown.remaining,
    sendMagicLink,
    sendEmailCode,
    phone,
    onPhoneIdentifierSubmit,
    sendPhoneCode,
    channelCooldown,
    enterCode,
    otpLength,
    digits,
    verifying,
    resending,
    sentTo,
    resendCooldown: resendCooldown.remaining,
    verifyCooldown: verifyCooldown.remaining,
    onVerify,
    resendCode,
    linkEmail,
    linkCooldown: linkCooldown.remaining,
    resendMagicLink,
    backToMethods,
    oauthProviders,
    oauthLoading,
    onOAuth,
    oauthError,
    dismissOAuthError,
    // Config gates the SFC reads to decide what to render.
    passwordEnabled,
    magicLinkEnabled,
    accessCodeEnabled,
    phoneEnabled,
    phoneChannels
  }
}
