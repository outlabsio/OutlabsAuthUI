import type { AccessCodeChannel } from '~/types/auth'
import type { AuthIdentifierSubmit } from '~/schemas/auth-flows'
import { normalizePhone } from '~/schemas/auth-flows'
import { describeAuthError } from '~/api/client'
import {
  clearPendingChallenge,
  readPendingChallenge,
  savePendingChallenge,
  type PendingChallenge
} from '~/auth/pending-challenge'
import { cooldownKey } from '~/utils/request-cooldown'
import { accessCodeChannelLabel } from '~/utils/auth-messages'
import { isWrongApplicationError, wrongApplicationMessage } from '~/utils/frontend-profile'
import { getRuntimeConfig } from '~/utils/runtime-config'
import { useForgotPassword, useRequestAccessCode, useVerifyAccessCode } from '~/queries/session'

// F4 — the "Can't sign in?" recovery flow (state machine behind /auth/recovery).
// Email → password-reset link (the identifier IS the email). Phone → OTP sign-in IS the
// recovery: a verified code signs the user in and lands on Account, which says honestly
// whether a reset link was emailed (the change-password form needs the current password, which
// a recovering user does not have). Steps live in the URL and the pending destination in
// sessionStorage, like sign-in; every send is behind a per-identifier cooldown.

export type RecoveryStep = 'identifier' | 'channel' | 'otp' | 'sent'

// What phone recovery tells Account about the reset link: sent, failed, or no email on file.
export type RecoveryResetOutcome = 'sent' | 'failed' | 'none'

export function useRecoveryFlow() {
  const toast = useToast()
  const { run } = useApiAction()
  const { phoneEnabled, phoneChannels, otpLength } = useAuthUiConfig()
  const { capabilitiesResolved } = useAuth()

  const pending = ref<PendingChallenge | null>(readPendingChallenge('recovery'))
  function remember(next: Omit<PendingChallenge, 'savedAt'>) {
    pending.value = savePendingChallenge('recovery', next)
  }
  function forget() {
    clearPendingChallenge('recovery')
    pending.value = null
  }

  const { step, goTo } = useUrlStep<RecoveryStep>({
    steps: { identifier: null, channel: 'channel', otp: 'code', sent: 'sent' },
    initial: 'identifier',
    available: (candidate) => {
      if (candidate === 'channel') return Boolean(pending.value?.phone)
      if (candidate === 'otp') return Boolean(pending.value?.code)
      if (candidate === 'sent') return Boolean(pending.value?.email)
      return true
    }
  })
  useAuthStepFocus(step, { skip: next => next === 'otp' })

  // Email and phone are separate forms (one open at a time) so the country selector never
  // competes with an email field.
  const activeMethod = ref<'email' | 'phone' | undefined>()
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

  // ── Email: password-reset link (the forgot/reset backend flow) ──
  const forgotPassword = useForgotPassword()
  const sending = ref('')
  const email = computed(() => pending.value?.email ?? '')
  const resetCooldown = useRequestCooldown(() => (email.value ? cooldownKey('reset-link', email.value) : null))

  async function sendResetLink(address: string): Promise<boolean> {
    const key = cooldownKey('reset-link', address)
    sending.value = 'reset'
    const res = await run(() => forgotPassword.mutateAsync({ email: address }), {
      error: error => describeAuthError(error, 'Could not send the reset link')
    })
    if (res.ok) startRequestCooldown(key)
    else startRequestCooldownFromError(key, res.error)
    sending.value = ''
    return res.ok
  }

  // The address being typed, so the submit shows that address's cooldown before it is
  // pressed (for example after browser Back from "Check your email").
  const emailDraft = ref('')
  const emailDraftCooldown = useRequestCooldown(() => (emailDraft.value.trim() ? cooldownKey('reset-link', emailDraft.value) : null))

  async function onEmailSubmit(input: AuthIdentifierSubmit) {
    const address = input.identifier.trim()
    const key = cooldownKey('reset-link', address)
    // Asked for this address moments ago: say how long to wait instead of sending again (or
    // claiming a link went out when the last request was refused). The submit is already
    // disabled while emailDraft cools down; this covers any other way in.
    if (requestCooldownActive(key)) {
      toast.add({
        title: 'Please wait a moment',
        description: `You can ask for another link for ${address} in ${requestCooldownSecondsLeft(key)} seconds.`,
        color: 'warning',
        icon: 'i-lucide-clock'
      })
      return
    }
    if (!(await sendResetLink(address))) return
    remember({ email: address })
    await goTo('sent')
  }

  async function resendResetLink() {
    if (!email.value || resetCooldown.active.value) return
    await sendResetLink(email.value)
  }

  // ── Phone: OTP sign-in IS the recovery ──
  const phone = computed(() => pending.value?.phone ?? '')
  const channelCooldowns = {
    whatsapp: useRequestCooldown(() => (phone.value ? cooldownKey('code:whatsapp', phone.value) : null)),
    sms: useRequestCooldown(() => (phone.value ? cooldownKey('code:sms', phone.value) : null))
  }
  function channelCooldown(channel: AccessCodeChannel) {
    return channel === 'email' ? 0 : channelCooldowns[channel].remaining.value
  }

  async function onPhoneSubmit(input: AuthIdentifierSubmit) {
    if (!phoneEnabled.value) return
    remember({ phone: normalizePhone(input.identifier, input.dialCode, input.countryCode) })
    await goTo('channel')
  }

  const requestAccessCode = useRequestAccessCode()

  async function requestCode(channel: AccessCodeChannel, identifier: string): Promise<boolean> {
    const key = cooldownKey(`code:${channel}`, identifier)
    const res = await run(() => requestAccessCode.mutateAsync({ phone: identifier, channel }), {
      error: error => describeAuthError(error, 'Could not send the code')
    })
    if (res.ok) startRequestCooldown(key)
    else startRequestCooldownFromError(key, res.error)
    return res.ok
  }

  async function sendPhoneCode(selected: AccessCodeChannel) {
    if (!phone.value || channelCooldown(selected) > 0) return
    sending.value = selected
    if (await requestCode(selected, phone.value)) {
      remember({ phone: phone.value, code: { channel: selected, identifier: phone.value } })
      await goTo('otp')
    }
    sending.value = ''
  }

  const verifyAccessCode = useVerifyAccessCode()
  const digits = ref<number[]>([])
  const code = computed(() => digits.value.join(''))
  const verifying = ref(false)
  const resending = ref(false)
  const pendingCode = computed(() => pending.value?.code ?? null)
  const resendCooldown = useRequestCooldown(() => (pendingCode.value ? cooldownKey(`code:${pendingCode.value.channel}`, pendingCode.value.identifier) : null))
  const verifyCooldown = useRequestCooldown(() => (pendingCode.value ? cooldownKey('verify', pendingCode.value.identifier) : null))

  const sentTo = computed(() => {
    const target = pendingCode.value
    if (!target) return ''
    return `If ${target.identifier} is a verified number on an account here, we sent a ${otpLength.value}-digit code by ${accessCodeChannelLabel(target.channel, 'inline')}.`
  })

  // As on sign-in: a frontend-profile rejection (403 wrong_application) is a deployment
  // problem, explained inline with the configured key instead of an "Invalid code" toast.
  const applicationError = ref('')

  async function onVerify() {
    const target = pendingCode.value
    if (!target || code.value.length < otpLength.value || verifying.value || verifyCooldown.active.value) return
    verifying.value = true
    applicationError.value = ''
    const res = await run(
      () => verifyAccessCode.mutateAsync({ phone: target.identifier, channel: target.channel, code: code.value }),
      { error: error => (isWrongApplicationError(error) ? null : describeAuthError(error, 'Invalid code')) }
    )
    if (res.ok) {
      // Keep showing this step until Account opens (no flash back to the identifier step).
      clearPendingChallenge('recovery')
      // Signed in with a one-time code. Email a reset link too, and tell Account what actually
      // happened so it never claims an email that was not sent.
      const outcome = await emailResetLink(res.data.user.email)
      await navigateTo({ path: '/app/account', query: { recover: 'password', reset: outcome } }, { replace: true })
    } else {
      digits.value = []
      verifyCooldown.startFromError(res.error)
      if (isWrongApplicationError(res.error)) applicationError.value = wrongApplicationMessage(getRuntimeConfig().frontendProfileKey)
    }
    verifying.value = false
  }

  async function emailResetLink(address: string | null | undefined): Promise<RecoveryResetOutcome> {
    if (!address) return 'none'
    try {
      await forgotPassword.mutateAsync({ email: address })
      startRequestCooldown(cooldownKey('reset-link', address))
      return 'sent'
    } catch (error) {
      startRequestCooldownFromError(cooldownKey('reset-link', address), error)
      return 'failed'
    }
  }

  async function resendCode() {
    const target = pendingCode.value
    if (!target || resendCooldown.active.value) return
    resending.value = true
    await requestCode(target.channel, target.identifier)
    resending.value = false
  }

  async function backToIdentifier() {
    digits.value = []
    emailDraft.value = ''
    applicationError.value = ''
    forget()
    await goTo('identifier')
  }

  return {
    otpLength,
    capabilitiesResolved,
    step,
    emailOpen,
    phoneOpen,
    email,
    phone,
    sending,
    emailDraft,
    emailDraftCooldown: emailDraftCooldown.remaining,
    onEmailSubmit,
    resetCooldown: resetCooldown.remaining,
    resendResetLink,
    onPhoneSubmit,
    sendPhoneCode,
    channelCooldown,
    digits,
    verifying,
    resending,
    sentTo,
    resendCooldown: resendCooldown.remaining,
    verifyCooldown: verifyCooldown.remaining,
    onVerify,
    applicationError,
    resendCode,
    backToIdentifier,
    phoneChannels
  }
}
