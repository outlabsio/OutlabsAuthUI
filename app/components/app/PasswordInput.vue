<script setup lang="ts">
// A password field with a Show/Hide toggle (stock UInput, its trailing slot and a link UButton),
// for every place a password is typed: sign-in, signup, invitation, reset, account security and
// the admin dialogs that set one. Put it inside a UFormField as you would a UInput; attributes
// (autocomplete, autofocus, class) pass through to the input.
//   <UFormField name="new_password" label="New password" required>
//     <AppPasswordInput v-model="state.new_password" autocomplete="new-password" class="w-full" />
//   </UFormField>
const model = defineModel<string | undefined>()
const visible = ref(false)
</script>

<template>
  <UInput v-model="model" :type="visible ? 'text' : 'password'">
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
