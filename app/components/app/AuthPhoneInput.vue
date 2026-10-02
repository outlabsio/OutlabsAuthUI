<script setup lang="ts">
import { vMaska } from 'maska/vue'
import { PHONE_CODES, phoneCodeFor, type PhoneCode } from '~/data/phone-codes'

// The phone number fields of a guest form: a searchable country code and the national number,
// masked for the chosen country. Loaded lazily (<LazyAppAuthPhoneInput>) so the country list,
// the mask library and the select menu only download where phone sign-in is offered. It must
// sit inside a UForm whose schema validates `identifier` (phoneIdentifierSchema). Typing a
// full international number (+…) bypasses the mask; normalizePhone composes the E.164 value.

const props = defineProps<{
  defaultCountry: string
}>()

const identifier = defineModel<string>({ required: true })
const country = defineModel<string>('country', { required: true })
// The selected country's calling code (+54), for the parent's E.164 composition.
const dialCode = defineModel<string>('dialCode', { required: true })

const selected = computed<PhoneCode>(() => phoneCodeFor(country.value || props.defaultCountry))

watch(selected, (entry) => {
  if (country.value !== entry.code) country.value = entry.code
  dialCode.value = entry.dialCode
}, { immediate: true })

// A new country means a new mask: start the number again.
watch(() => selected.value.code, (code, previous) => {
  if (previous && code !== previous) identifier.value = ''
})

const placeholder = computed(() => {
  const mask = selected.value.mask
  return (Array.isArray(mask) ? mask.at(-1) ?? '' : mask).replaceAll('#', '_')
})

const bypassedMaskValue = ref('')
const maskOptions = computed(() => ({
  mask: selected.value.mask,
  preProcess(value: string) {
    // An international number (or anything that is clearly not a national number) is kept
    // as typed; the schema reports what is wrong with it.
    if (value.trim().startsWith('+') || /[A-Za-z@]/.test(value)) {
      bypassedMaskValue.value = value
      return ''
    }
    bypassedMaskValue.value = ''
    return value
  },
  postProcess(value: string) {
    if (bypassedMaskValue.value) {
      const rawValue = bypassedMaskValue.value
      bypassedMaskValue.value = ''
      return rawValue
    }
    return value
  }
}))
</script>

<template>
  <UFormField name="country" label="Country code">
    <USelectMenu
      v-model="country"
      value-key="code"
      :items="[...PHONE_CODES]"
      :filter-fields="['name', 'code', 'dialCode']"
      :search-input="{ placeholder: 'Search country...', icon: 'i-lucide-search' }"
      aria-label="Country code"
      class="w-full"
    >
      <template #default>
        <span class="truncate">{{ selected.emoji }} {{ selected.name }} ({{ selected.dialCode }})</span>
      </template>
      <template #item-leading="{ item }">
        {{ item.emoji }}
      </template>
      <template #item-label="{ item }">
        {{ item.name }} ({{ item.dialCode }})
      </template>
    </USelectMenu>
  </UFormField>

  <UFormField name="identifier" label="Phone number" required>
    <UInput
      v-model="identifier"
      v-maska="maskOptions"
      type="tel"
      inputmode="tel"
      autocomplete="tel-national"
      :placeholder="placeholder"
      class="w-full"
    />
  </UFormField>
</template>
