<script setup lang="ts">
import { codeSchemaFor } from '~/schemas/auth-flows'
import { cooldownLabel } from '~/utils/request-cooldown'

// The one-time-code step shared by sign-in (email and phone codes), the access-code page and
// recovery: where the code went, the code field (focused on arrival, numeric keypad, one-time
// code autofill), verify, resend and back. The code is a UForm field like any other: the schema
// asks for every digit, the last digit submits the form, and a code the server refused is said
// on the field (`error`, from the flow's codeFieldError), where it stays after the boxes are
// cleared for the next attempt instead of passing in a toast. Digits are v-modeled so the flow
// composable can clear them after a failed verify. Resend and verify are disabled while their
// rate-limit cooldowns run.

const props = withDefaults(defineProps<{
  sentTo: string
  length: number
  verifying: boolean
  resending: boolean
  // Seconds before another code may be requested / another attempt made (0 = none).
  resendCooldown?: number
  verifyCooldown?: number
  backLabel?: string
  // Why the server refused the last code; '' when there is nothing to say.
  error?: string
}>(), {
  resendCooldown: 0,
  verifyCooldown: 0,
  backLabel: 'Use a different method',
  error: ''
})

const emit = defineEmits<{
  verify: []
  resend: []
  back: []
}>()

const digits = defineModel<number[]>('digits', { required: true })
const state = reactive({ code: digits })
const schema = computed(() => codeSchemaFor(props.length))
const form = useTemplateRef('form')
const pin = useTemplateRef<{ inputsRef?: Array<{ $el?: HTMLElement } | null> }>('pin')

// A refused code disables the boxes while it is checked, which drops the focus: put it back on
// the first box once they are usable again, so the next code can be typed straight away.
watch(() => [props.error, props.verifying] as const, async ([error, verifying]) => {
  if (!error || verifying) return
  await nextTick()
  pin.value?.inputsRef?.[0]?.$el?.focus()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppAuthStepHeading title="Enter your code">
      <template #description>
        <span role="status">{{ sentTo }}</span>
      </template>
    </AppAuthStepHeading>

    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      class="flex flex-col items-center gap-4"
      @submit="emit('verify')"
    >
      <UFormField
        name="code"
        label="Access code"
        :error="error || undefined"
        class="flex flex-col items-center"
      >
        <UPinInput
          ref="pin"
          v-model="state.code"
          :length="length"
          type="number"
          otp
          autofocus
          size="lg"
          aria-label="Access code"
          :disabled="verifying"
          @complete="form?.submit()"
        />
        <template #error="{ error: message }">
          <span role="alert">{{ message }}</span>
        </template>
      </UFormField>
      <UButton
        type="submit"
        block
        :loading="verifying"
        :disabled="digits.length < length || verifyCooldown > 0"
        :label="cooldownLabel('Verify and sign in', verifyCooldown)"
      />
    </UForm>

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <UButton
        variant="link"
        color="neutral"
        class="px-0"
        :loading="resending"
        :disabled="resending || resendCooldown > 0"
        :label="cooldownLabel('Resend code', resendCooldown)"
        @click="emit('resend')"
      />
      <UButton
        variant="link"
        color="neutral"
        class="px-0"
        :label="backLabel"
        @click="emit('back')"
      />
    </div>
  </div>
</template>
