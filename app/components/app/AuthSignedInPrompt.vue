<script setup lang="ts">
// Shown when an emailed link (magic link, invitation) is opened in a browser that is already
// signed in — often someone else's account on a shared machine. Nothing happens until the user
// chooses: sign out and continue with the link, or keep the current session (which goes where
// the link was headed, ?redirect, else the dashboard).
defineProps<{
  email: string
  // What the link is for, e.g. "This sign-in link may be for a different account."
  description: string
  continueLabel: string
  loading?: boolean
}>()

const emit = defineEmits<{
  continue: []
}>()

const { destination } = useAuthIntent()
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppAuthStepHeading :title="`You're signed in as ${email}`" :description="description" />
    <div class="flex flex-col gap-2">
      <UButton
        block
        icon="i-lucide-log-out"
        :loading="loading"
        :label="continueLabel"
        @click="emit('continue')"
      />
      <UButton
        block
        color="neutral"
        variant="subtle"
        :disabled="loading"
        :label="`Stay signed in as ${email}`"
        :to="destination()"
      />
    </div>
  </div>
</template>
