import { useQueryCache } from '@pinia/colada'
import type { FormSubmitEvent } from '@nuxt/ui'
import { describeAuthError } from '~/api/client'
import { useConfirmPhoneVerification, useRequestPhoneVerification, useUpdateProfile } from '~/queries/account'
import { SESSION_KEY } from '~/queries/session'
import { normalizePhone } from '~/schemas/auth-flows'
import type { PhoneNumberSchema } from '~/schemas/account'
import type { SessionUser } from '~/types/auth'
import { phoneChannelsText } from '~/utils/account'
import { cooldownKey } from '~/utils/request-cooldown'

// The Profile tab's phone number: add, change or remove it (a dialog with the sign-in
// country-code picker), and, where the server offers phone sign-in, verify it with a code.
//
// Phone sign-in exists only when the backend has access codes on and the deployment surfaces a
// phone channel (useAuthUiConfig().phoneEnabled). Without it the number is plain profile data:
// no verification step and no promise of sign-in codes (F-099). A verified number stops being
// verified as soon as it changes or is removed, so both say so first (F-101), and a new number
// goes straight to its verification step (F-100).

export function useAccountPhone() {
  const { user } = useAuth()
  const queryCache = useQueryCache()
  const { run } = useApiAction()
  const { phoneEnabled, phoneChannels, defaultCountry, otpLength } = useAuthUiConfig()

  const phone = computed(() => user.value?.phone ?? null)
  const verified = computed(() => Boolean(user.value?.phone_verified))
  // The sign-in promise is only made where the server can keep it.
  const signInOffered = phoneEnabled
  const channelsText = computed(() => phoneChannelsText(phoneChannels.value))

  const updateProfile = useUpdateProfile()
  function storeUser(next: SessionUser) {
    queryCache.setQueryData(SESSION_KEY, next)
  }

  // --- Add / change (dialog) ---
  const dialogOpen = ref(false)
  const dialogError = ref<ActionError | null>(null)
  const dialogForm = useDialogForm('phoneDialog')
  const dialogState = reactive<PhoneNumberSchema>({ identifier: '', country: '', dialCode: '' })
  // Dirty = the number or the chosen country changed. The picker fills in the dial code (and
  // normalises the country) when it mounts; that is not an edit to ask about before closing.
  const dialogOpenedWith = ref({ identifier: '', country: '' })
  const dialogDirty = computed(() =>
    dialogState.identifier.trim() !== dialogOpenedWith.value.identifier
    || (dialogState.country !== '' && dialogState.country !== dialogOpenedWith.value.country))

  function openDialog() {
    // An existing number is shown in international form, which the picker keeps as typed.
    const opened = { identifier: phone.value ?? '', country: defaultCountry.value.trim().toUpperCase() }
    Object.assign(dialogState, { ...opened, dialCode: '' })
    dialogOpenedWith.value = opened
    dialogError.value = null
    dialogOpen.value = true
  }

  async function onSaveNumber(event: FormSubmitEvent<{ identifier: string }>) {
    const next = normalizePhone(event.data.identifier, dialogState.dialCode, dialogState.country)
    if (next === phone.value) {
      dialogOpen.value = false
      return
    }
    const res = await run(() => updateProfile.mutateAsync({ phone: next }), {
      success: 'Phone number saved',
      error: 'Could not save the phone number',
      form: dialogForm,
      inline: dialogError,
      fieldMap: { phone: 'identifier' }
    })
    if (!res.ok) return
    storeUser(res.data)
    dialogOpen.value = false
    // A new number is unverified: start its verification right away.
    if (signInOffered.value) await sendCode()
  }

  // --- Remove (confirm) ---
  const remove = useConfirmAction<string, SessionUser>({
    describe: number => ({
      title: `Remove phone number ${number}`,
      effects: verified.value && signInOffered.value
        ? [`You can no longer sign in with codes sent to ${number}.`, 'You can add a number again at any time; it must be verified again.']
        : ['The number is removed from your profile. You can add one again at any time.'],
      confirmLabel: 'Remove phone number'
    }),
    action: () => updateProfile.mutateAsync({ phone: null }),
    success: 'Phone number removed',
    error: 'Could not remove the phone number',
    onSuccess: next => storeUser(next)
  })

  // --- Verification ---
  const step = ref<'idle' | 'verify'>('idle')
  const digits = ref<number[]>([])
  const code = computed(() => digits.value.join(''))
  const sending = ref(false)
  const confirming = ref(false)
  const requestCode = useRequestPhoneVerification()
  const confirmCode = useConfirmPhoneVerification()
  // The backend limits verification codes per user: one cooldown per number.
  const sendCooldown = useRequestCooldown(() => (phone.value ? cooldownKey('phone-verify', phone.value) : null))
  const confirmCooldown = useRequestCooldown(() => (phone.value ? cooldownKey('phone-confirm', phone.value) : null))

  // A code belongs to the number it was sent to: a changed or removed number starts over.
  watch(phone, () => {
    step.value = 'idle'
    digits.value = []
  })

  // The code input takes focus when the step appears, so the code can be typed (or pasted from
  // the one-time-code autofill) straight away.
  const codeInput = useTemplateRef<{ inputsRef?: Array<{ $el?: HTMLElement } | null> }>('phoneCodeInput')
  watch(step, async (current) => {
    if (current !== 'verify') return
    await nextTick()
    const first = codeInput.value?.inputsRef?.[0]?.$el
    if (first && document.activeElement !== first) first.focus()
  })

  async function sendCode() {
    if (sendCooldown.active.value || sending.value || !phone.value) return
    sending.value = true
    const res = await run(() => requestCode.mutateAsync(), {
      success: step.value === 'verify' ? { title: 'Code sent again', description: `A new code is on its way to ${phone.value}.` } : undefined,
      error: err => describeAuthError(err, 'Could not send the verification code')
    })
    if (res.ok) {
      sendCooldown.start()
      digits.value = []
      step.value = 'verify'
    } else {
      sendCooldown.startFromError(res.error)
    }
    sending.value = false
  }

  async function onConfirm() {
    if (code.value.length < otpLength.value || confirming.value || confirmCooldown.active.value) return
    confirming.value = true
    const res = await run(() => confirmCode.mutateAsync(code.value), {
      success: 'Phone number verified',
      error: err => describeAuthError(err, 'Could not verify the phone number')
    })
    if (res.ok) {
      storeUser(res.data)
      step.value = 'idle'
    } else {
      confirmCooldown.startFromError(res.error)
    }
    digits.value = []
    confirming.value = false
  }

  function onUseDifferentNumber() {
    step.value = 'idle'
    digits.value = []
    openDialog()
  }

  return {
    phone,
    verified,
    signInOffered,
    channelsText,
    defaultCountry,
    otpLength,
    dialogOpen,
    dialogError,
    dialogState,
    dialogDirty,
    openDialog,
    onSaveNumber,
    remove,
    step,
    digits,
    code,
    sending,
    confirming,
    sendCooldown: sendCooldown.remaining,
    confirmCooldown: confirmCooldown.remaining,
    sendCode,
    onConfirm,
    onUseDifferentNumber
  }
}
