<script setup lang="ts">
import { loginSchema } from '~/schemas/login'

// Login — logic in useLoginForm; this file is display only.
definePageMeta({ layout: 'auth' })

const {
  signInDescription,
  methods,
  oauthProviders,
  oauthErrorMessage,
  providerLabel,
  state,
  loading,
  onSubmit,
  oauthLoading,
  onOAuth
} = useLoginForm()
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="space-y-1">
      <h1 class="text-lg font-semibold text-highlighted">
        Sign in
      </h1>
      <p class="text-sm text-muted">
        {{ signInDescription }}
      </p>
    </div>

    <UAlert
      v-if="oauthErrorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="oauthErrorMessage"
    />

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

    <template v-if="oauthProviders.length">
      <USeparator label="or" />
      <div class="flex flex-col gap-2">
        <UButton
          v-for="provider in oauthProviders"
          :key="provider"
          block
          color="neutral"
          variant="subtle"
          :icon="`i-simple-icons-${provider}`"
          :loading="oauthLoading === provider"
          :label="`Continue with ${providerLabel(provider)}`"
          @click="onOAuth(provider)"
        />
      </div>
    </template>

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
