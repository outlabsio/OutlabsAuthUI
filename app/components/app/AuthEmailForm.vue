<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { EmailPasswordSchema } from '~/schemas/auth-flows'
import { emailPasswordSchema } from '~/schemas/auth-flows'
import { cooldownLabel } from '~/utils/request-cooldown'

// The email method's form — email + password on one surface, with the passwordless
// alternates (a sign-in link, a one-time code) stacked beneath it. Rendered directly for
// email-only deployments, or unfolded inside the "Continue with email" collapsible. The form
// state is a model so the flow composable shares it. An alternate validates only the email
// field (on the field itself) before it is requested.

defineProps<{
  loading: boolean
  methodLoading: string
  magicLinkEnabled: boolean
  accessCodeEnabled: boolean
  // Seconds left before another link / code may be requested for the typed email.
  magicLinkCooldown: number
  emailCodeCooldown: number
}>()

const emit = defineEmits<{
  submit: [event: FormSubmitEvent<EmailPasswordSchema>]
  magicLink: [email: string]
  emailCode: [email: string]
}>()

const state = defineModel<Partial<EmailPasswordSchema>>('state', { required: true })

const form = useTemplateRef('form')

// UForm validates before emitting — pass its event straight through.
function onSubmit(event: FormSubmitEvent<EmailPasswordSchema>) {
  emit('submit', event)
}

async function requestAlternate(kind: 'magicLink' | 'emailCode') {
  // Validates the email alone; a failure shows on the field and leaves the password untouched.
  const valid = await form.value?.validate({ name: 'email', silent: true })
  if (!valid) return
  const email = (state.value.email ?? '').trim()
  if (kind === 'magicLink') emit('magicLink', email)
  else emit('emailCode', email)
}
</script>

<template>
  <div class="flex flex-col gap-4 pt-3">
    <UForm
      ref="form"
      :schema="emailPasswordSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField name="email" label="Email" required>
        <UInput
          v-model="state.email"
          type="email"
          icon="i-lucide-mail"
          autocomplete="email"
          placeholder="you@example.com"
          class="w-full"
        />
      </UFormField>

      <UFormField name="password" label="Password" required>
        <AppPasswordInput
          v-model="state.password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        block
        :loading="loading"
        label="Sign in"
      />
    </UForm>

    <div v-if="magicLinkEnabled || accessCodeEnabled" class="flex flex-col gap-2">
      <UButton
        v-if="magicLinkEnabled"
        block
        color="neutral"
        variant="ghost"
        icon="i-lucide-link"
        :loading="methodLoading === 'magic-link'"
        :disabled="methodLoading !== '' || magicLinkCooldown > 0"
        :label="cooldownLabel('Email me a magic link instead', magicLinkCooldown)"
        @click="requestAlternate('magicLink')"
      />
      <UButton
        v-if="accessCodeEnabled"
        block
        color="neutral"
        variant="ghost"
        icon="i-lucide-hash"
        :loading="methodLoading === 'email-code'"
        :disabled="methodLoading !== '' || emailCodeCooldown > 0"
        :label="cooldownLabel('Email me a code instead', emailCodeCooldown)"
        @click="requestAlternate('emailCode')"
      />
    </div>
  </div>
</template>
