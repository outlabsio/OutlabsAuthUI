<script setup lang="ts">
import { EXPIRY_ITEMS, type ExpiryChoice } from '~/utils/api-keys'

// The limits every key form shares (personal and service-account keys, create and edit; F-114,
// F-116): rate limit as a whole number with an explicit "No rate limit" switch (the API reads 0 as
// unlimited, so a cleared field never silently means it), expiry from presets on create (an
// existing key's expiry is fixed: shown read-only on edit), and the IP allowlist as tags.
// Place inside the dialog's UForm: the UFormField names match apiKeyFieldsShape.
const props = withDefaults(defineProps<{
  idPrefix: string
  /** Edit: the expiry cannot change, so it is shown instead of chosen. */
  editing?: boolean
  expiresAt?: string | null
}>(), { editing: false, expiresAt: null })

const noRateLimit = defineModel<boolean>('noRateLimit', { required: true })
// UInputNumber reports a cleared field as null or undefined.
const rateLimit = defineModel<number | null | undefined>('rateLimit')
const expires = defineModel<ExpiryChoice>('expires', { required: true })
const ipWhitelist = defineModel<string[]>('ipWhitelist', { required: true })

// Turning the switch on clears the number (it is not sent); turning it off brings it back.
let previous: number | null = null
watch(noRateLimit, (none) => {
  if (none) {
    previous = rateLimit.value ?? null
    rateLimit.value = null
  } else if (rateLimit.value == null) {
    rateLimit.value = previous && previous > 0 ? previous : 60
  }
})

const id = (name: string) => `${props.idPrefix}-${name}`
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div class="flex flex-col gap-2">
      <UFormField
        name="rate_limit_per_minute"
        label="Rate limit"
        :required="!noRateLimit"
        help="Requests per minute."
      >
        <UInputNumber
          :id="id('rate-limit')"
          v-model="rateLimit"
          :min="1"
          :step="1"
          :disabled="noRateLimit"
          :placeholder="noRateLimit ? 'No limit' : undefined"
          class="w-full"
        />
      </UFormField>
      <UFormField name="no_rate_limit">
        <USwitch
          :id="id('no-rate-limit')"
          v-model="noRateLimit"
          label="No rate limit"
          description="The key is never throttled."
        />
      </UFormField>
    </div>
    <UFormField
      v-if="!editing"
      name="expires"
      label="Expires after"
      required
      help="Choose Never only for keys you rotate yourself."
    >
      <USelect
        :id="id('expires')"
        v-model="expires"
        :items="EXPIRY_ITEMS"
        class="w-full"
      />
    </UFormField>
    <UFormField
      v-else
      label="Expires"
      help="A key's expiry can't be changed. Create a new key for a different expiry."
    >
      <p class="text-sm text-default">
        <AppTimestamp :value="expiresAt" fallback="Never" />
      </p>
    </UFormField>
  </div>

  <UFormField
    name="ip_whitelist"
    label="IP allowlist"
    hint="Optional"
    help="IP addresses or CIDR ranges. Requests from anywhere else are refused; leave it empty to allow any address. Paste several at once, separated by commas or spaces."
  >
    <UInputTags
      :id="id('ip-allowlist')"
      v-model="ipWhitelist"
      placeholder="203.0.113.4 or 198.51.100.0/24"
      :delimiter="/[\s,]+/"
      add-on-paste
      add-on-blur
      class="w-full"
    />
  </UFormField>
</template>
