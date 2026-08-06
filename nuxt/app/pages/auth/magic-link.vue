<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { emailRequestSchema, type EmailRequestSchema } from '~/schemas/auth-flows'
import { useRequestMagicLink, useVerifyMagicLink } from '~/queries/session'
import { getApiErrorMessage } from '~/utils/api'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const toast = useToast()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const requestMagicLink = useRequestMagicLink()
const verifyMagicLink = useVerifyMagicLink()
const state = reactive<Partial<EmailRequestSchema>>({ email: '' })
const loading = ref(false)
const sent = ref(false)
const verifying = ref(false)
const verifyError = ref('')

// If the emailed link lands here with a token, verify it and sign the user in.
onMounted(async () => {
  if (!token.value) return
  verifying.value = true
  try {
    await verifyMagicLink.mutateAsync({ token: token.value })
    await navigateTo('/app/dashboard', { replace: true })
  } catch (err) {
    verifyError.value = getApiErrorMessage(err)
  } finally {
    verifying.value = false
  }
})

async function onSubmit(event: FormSubmitEvent<EmailRequestSchema>) {
  loading.value = true
  try {
    await requestMagicLink.mutateAsync({ email: event.data.email })
    sent.value = true
  } catch (err) {
    toast.add({ title: 'Could not send magic link', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="token && verifying" class="flex flex-col items-center gap-3 py-4">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
      <p class="text-sm text-muted">
        Signing you in...
      </p>
    </div>

    <div v-else-if="token && verifyError" class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <h1 class="text-lg font-semibold text-highlighted">
        Link expired
      </h1>
      <p class="text-sm text-muted">
        {{ verifyError }}
      </p>
      <ULink to="/auth/magic-link" class="text-sm text-muted hover:text-default" external>
        Request a new link
      </ULink>
    </div>

    <div v-else-if="sent" class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-mail-check" class="size-8 text-primary" />
      <h1 class="text-lg font-semibold text-highlighted">
        Check your email
      </h1>
      <p class="text-sm text-muted">
        We sent you a magic sign-in link.
      </p>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </div>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Sign in with a magic link
        </h1>
        <p class="text-sm text-muted">
          We'll email you a link to sign in — no password needed.
        </p>
      </div>
      <UForm
        :schema="emailRequestSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField name="email" label="Email" required>
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Email me a link"
        />
      </UForm>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </template>
  </div>
</template>
