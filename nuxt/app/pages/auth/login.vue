<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginSchema } from '~/schemas/login'
import { useLogin } from '~/queries/session'
import { getApiErrorMessage } from '~/utils/api'
import type { RuntimeConfig } from '~/utils/runtime-config'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const toast = useToast()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
const { capabilities } = useAuth()

// Passwordless methods are shown only when the mounted backend exposes them (A1).
const methods = computed(() => capabilities.value?.auth_methods)

// A4 — UForm + Zod, stock behavior. Login is a Colada mutation (useLogin) that funnels
// through finalizeAuth, seeding the session cache on success.
const login = useLogin()
const state = reactive<Partial<LoginSchema>>({ email: '', password: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<LoginSchema>) {
  loading.value = true
  try {
    await login.mutateAsync(event.data)
    // Only honor internal /app/ redirect targets (open-redirect guard).
    const target = route.query.redirect
    const redirect = typeof target === 'string' && target.startsWith('/app/') ? target : '/app/dashboard'
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

    <div class="flex flex-col gap-2 text-sm">
      <div class="flex items-center justify-between">
        <ULink to="/auth/forgot-password" class="text-muted hover:text-default">
          Forgot password?
        </ULink>
        <ULink v-if="methods?.magic_link" to="/auth/magic-link" class="text-muted hover:text-default">
          Sign in with a magic link
        </ULink>
      </div>
      <ULink v-if="methods?.access_code" to="/auth/access-code" class="text-muted hover:text-default">
        Sign in with an access code
      </ULink>
    </div>
  </div>
</template>
