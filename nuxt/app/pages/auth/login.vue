<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginSchema } from '~/schemas/login'
import { useSessionStore } from '~/stores/session'
import { getApiErrorMessage } from '~/utils/api'
import type { RuntimeConfig } from '~/utils/runtime-config'

definePageMeta({ layout: 'auth' })

const session = useSessionStore()
const route = useRoute()
const toast = useToast()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')

// A4 — UForm + Zod, stock behavior. UForm validates before emitting @submit.
const state = reactive<Partial<LoginSchema>>({ email: '', password: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<LoginSchema>) {
  loading.value = true
  try {
    await session.login(event.data)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app/dashboard'
    await navigateTo(redirect, { replace: true })
  } catch (error) {
    toast.add({
      title: 'Sign in failed',
      description: getApiErrorMessage(error),
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="space-y-1">
      <h1 class="text-lg font-semibold text-highlighted">
        Sign in
      </h1>
      <p class="text-sm text-muted">
        {{ runtimeConfig?.signInDescription }}
      </p>
    </div>

    <UForm
      :schema="loginSchema"
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

      <UFormField name="password" label="Password" required>
        <UInput
          v-model="state.password"
          type="password"
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

    <div class="flex items-center justify-between text-sm">
      <ULink to="/auth/forgot-password" class="text-muted hover:text-default">
        Forgot password?
      </ULink>
      <ULink to="/auth/magic-link" class="text-muted hover:text-default">
        Magic link
      </ULink>
    </div>
  </div>
</template>
