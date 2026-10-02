<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { emailIdentifierSchema, phoneIdentifierSchema, type AuthIdentifierSubmit, type IdentifierSchema } from '~/schemas/auth-flows'
import { cooldownLabel } from '~/utils/request-cooldown'

// The identifier step of a guest flow: an email address, or a phone number with its country
// code. Emits the raw input plus the selected dial code and country; the flow composable owns
// normalization (normalizePhone) and branching. The phone fields are lazy
// (AppAuthPhoneInput), so email-only screens never load the country list or the mask library.

const props = withDefaults(defineProps<{
  kind: 'email' | 'phone'
  // ISO country preselected in the phone country code (authUi.defaultCountry).
  defaultCountry?: string
  loading?: boolean
  submitLabel?: string
  // Seconds before the submit may be used again (a request cooldown keyed on the typed
  // identifier, read through the optional v-model:identifier). Disables it and says "in Ns".
  submitCooldown?: number
}>(), {
  defaultCountry: '',
  loading: false,
  submitLabel: 'Continue',
  submitCooldown: 0
})

// The raw typed value (email, or the national phone number), for a caller that keys
// something on it before submit. Optional: without a v-model the field keeps its own state.
const identifier = defineModel<string>('identifier', { default: '' })

const emit = defineEmits<{
  submit: [AuthIdentifierSubmit]
}>()

const schema = computed(() => (props.kind === 'phone' ? phoneIdentifierSchema : emailIdentifierSchema))
const state = reactive({ identifier })
const country = ref(props.defaultCountry)
const dialCode = ref('')

function onSubmit(event: FormSubmitEvent<IdentifierSchema>) {
  emit('submit', {
    identifier: event.data.identifier,
    dialCode: dialCode.value,
    countryCode: country.value
  })
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    :validate-on="[]"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField
      v-if="kind === 'email'"
      name="identifier"
      label="Email"
      required
    >
      <UInput
        v-model="state.identifier"
        type="email"
        icon="i-lucide-mail"
        autocomplete="email"
        placeholder="you@example.com"
        class="w-full"
      />
    </UFormField>
    <LazyAppAuthPhoneInput
      v-else
      v-model="state.identifier"
      v-model:country="country"
      v-model:dial-code="dialCode"
      :default-country="defaultCountry"
    />

    <UButton
      type="submit"
      block
      :loading="loading"
      :disabled="submitCooldown > 0"
      :label="cooldownLabel(submitLabel, submitCooldown)"
    />
  </UForm>
</template>
