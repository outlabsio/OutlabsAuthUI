<script setup lang="ts">
import type { User } from '~/types/user'

// "Edit profile" for another account (F-064): one dialog for the users list's row menu and the
// user detail's actions. Logic in useUserProfileForm.
//   <AppUserProfileDialog v-model:open="editOpen" :user="editTarget" />
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ user: User | null }>()

const { state, schema, error, dirty, isSelf, namesSet, emailChanged, onSubmit } = useUserProfileForm(() => props.user, open)
</script>

<template>
  <AppFormDialog
    ref="profileDialog"
    v-model:open="open"
    :title="`Edit ${user?.email ?? 'user'}`"
    description="Changes apply to the account right away."
    :schema="schema"
    :state="state"
    :error="error"
    :dirty="dirty"
    require-changes
    submit-label="Save changes"
    @submit="onSubmit"
  >
    <UFormField
      name="email"
      label="Email"
      :required="!isSelf"
      :help="isSelf
        ? 'Your own sign-in email is read-only.'
        : emailChanged ? 'This becomes the sign-in email, and the address is marked unverified until the user confirms it.' : undefined"
    >
      <UInput
        v-model="state.email"
        type="email"
        autocomplete="off"
        class="w-full"
        :disabled="isSelf"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="first_name"
        label="First name"
        :required="namesSet.first"
        :hint="namesSet.first ? undefined : 'Optional'"
      >
        <UInput v-model="state.first_name" class="w-full" />
      </UFormField>
      <UFormField
        name="last_name"
        label="Last name"
        :required="namesSet.last"
        :hint="namesSet.last ? undefined : 'Optional'"
      >
        <UInput v-model="state.last_name" class="w-full" />
      </UFormField>
    </div>
    <UFormField
      name="phone"
      label="Phone"
      hint="Optional"
      help="E.164 format, e.g. +15551234567."
    >
      <UInput
        v-model="state.phone"
        type="tel"
        inputmode="tel"
        autocomplete="off"
        class="w-full"
        placeholder="+15551234567"
      />
    </UFormField>
  </AppFormDialog>
</template>
