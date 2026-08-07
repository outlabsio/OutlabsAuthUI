<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { setPasswordSchema, type SetPasswordSchema } from '~/schemas/auth-flows'
import { useAcceptInvite } from '~/queries/session'
import { getApiErrorMessage } from '~/api/client'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const toast = useToast()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const acceptInvite = useAcceptInvite()
const state = reactive<SetPasswordSchema>({ new_password: '', confirm_password: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<SetPasswordSchema>) {
  loading.value = true
  try {
    await acceptInvite.mutateAsync({ token: token.value, new_password: event.data.new_password })
    await navigateTo('/app/dashboard', { replace: true })
  } catch (err) {
    toast.add({ title: 'Could not accept invitation', description: getApiErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="!token" class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <h1 class="text-lg font-semibold text-highlighted">
        Invalid invitation link
      </h1>
      <p class="text-sm text-muted">
        This link is missing its token.
      </p>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </div>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-highlighted">
          Accept your invitation
        </h1>
        <p class="text-sm text-muted">
          Set a password to activate your account.
        </p>
      </div>
      <UForm
        :schema="setPasswordSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField name="new_password" label="Password" required>
          <UInput
            v-model="state.new_password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField name="confirm_password" label="Confirm password" required>
          <UInput
            v-model="state.confirm_password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Accept and sign in"
        />
      </UForm>
    </template>
  </div>
</template>
