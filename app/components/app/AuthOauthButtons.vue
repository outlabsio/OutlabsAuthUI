<script setup lang="ts">
// "Continue with <provider>" buttons for the sign-in and signup pages, one per provider the
// deployment declares and the backend mounts (useAuthUiConfig().oauthProviders). Emits the
// chosen provider; the flow composable owns the authorize hand-off and its loading state.
import { oauthProviderLabel } from '~/utils/auth-messages'

defineProps<{
  providers: string[]
  loadingProvider: string
}>()

const emit = defineEmits<{
  select: [provider: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <UButton
      v-for="provider in providers"
      :key="provider"
      block
      color="neutral"
      variant="subtle"
      :icon="`i-simple-icons-${provider}`"
      :loading="loadingProvider === provider"
      :disabled="loadingProvider !== '' && loadingProvider !== provider"
      :label="`Continue with ${oauthProviderLabel(provider)}`"
      @click="emit('select', provider)"
    />
  </div>
</template>
