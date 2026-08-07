import type { FormSubmitEvent } from '@nuxt/ui'
import type { EmailRequestSchema } from '~/schemas/auth-flows'
import { useRequestAccessCode, useVerifyAccessCode } from '~/queries/session'
import { describeAuthError } from '~/api/client'

// Feature logic for the access-code sign-in flow (request a code → verify it). The SFC binds
// this and renders the two steps.

const CODE_LENGTH = 6

export function useAccessCodeForm() {
  const { run } = useApiAction()
  const requestAccessCode = useRequestAccessCode()
  const verifyAccessCode = useVerifyAccessCode()

  const step = ref<'request' | 'verify'>('request')
  const email = ref('')
  const requestState = reactive<Partial<EmailRequestSchema>>({ email: '' })
  const requesting = ref(false)

  // The one-time code is entered via Nuxt UI's OTP input (a digit per slot).
  const digits = ref<number[]>([])
  const code = computed(() => digits.value.join(''))
  const verifying = ref(false)

  async function onRequest(event: FormSubmitEvent<EmailRequestSchema>) {
    requesting.value = true
    const res = await run(() => requestAccessCode.mutateAsync({ email: event.data.email, channel: 'email' }), {
      error: err => describeAuthError(err, 'Could not send code')
    })
    if (res.ok) {
      email.value = event.data.email
      step.value = 'verify'
    }
    requesting.value = false
  }

  // Called by the button and by the OTP input's @complete (auto-submit on the 6th digit).
  async function onVerify() {
    if (code.value.length < CODE_LENGTH || verifying.value) return
    verifying.value = true
    const res = await run(() => verifyAccessCode.mutateAsync({ email: email.value, channel: 'email', code: code.value }), { error: 'Invalid code' })
    if (res.ok) await navigateTo('/app/dashboard', { replace: true })
    else digits.value = []
    verifying.value = false
  }

  function useDifferentEmail() {
    step.value = 'request'
    digits.value = []
  }

  return { CODE_LENGTH, step, email, requestState, requesting, digits, code, verifying, onRequest, onVerify, useDifferentEmail }
}
