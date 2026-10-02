<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { RegisterSchema } from '~/schemas/auth-flows'
import { PASSWORD_POLICY_HINT, registerSchema } from '~/schemas/auth-flows'

// The email register form — rendered directly when no OAuth providers are configured, or
// unfolded inside the signup page's "Continue with email" collapsible. The form state is a
// model so useSignupForm shares it; the submit event carries the form so a server-side
// password-policy refusal can land on the password field.

type FormErrorsTarget = { setErrors: (errors: Array<{ name: string, message: string }>) => void }

defineProps<{
  loading: boolean
}>()

const emit = defineEmits<{
  submit: [event: FormSubmitEvent<RegisterSchema>, form: FormErrorsTarget | null]
}>()

const state = defineModel<Partial<RegisterSchema>>('state', { required: true })
const form = useTemplateRef<FormErrorsTarget>('form')

function onSubmit(event: FormSubmitEvent<RegisterSchema>) {
  emit('submit', event, form.value)
}
</script>

<template>
  <UForm
    ref="form"
    :schema="registerSchema"
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

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField name="first_name" label="First name" hint="Optional">
        <UInput v-model="state.first_name" autocomplete="given-name" class="w-full" />
      </UFormField>
      <UFormField name="last_name" label="Last name" hint="Optional">
        <UInput v-model="state.last_name" autocomplete="family-name" class="w-full" />
      </UFormField>
    </div>

    <UFormField
      name="password"
      label="Password"
      :help="PASSWORD_POLICY_HINT"
      required
    >
      <AppPasswordInput
        v-model="state.password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>

    <UFormField name="confirm_password" label="Confirm password" required>
      <AppPasswordInput
        v-model="state.confirm_password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>

    <UButton
      type="submit"
      block
      :loading="loading"
      label="Create account"
    />
  </UForm>
</template>
