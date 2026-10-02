<script setup lang="ts">
// Guest-surface alert when the auth API cannot be used (no connection, timeout, 429, 5xx), with
// advice that matches the failure.
// Display only; logic in useAuthApiStatus.
const { message, retrying, retry } = useAuthApiStatus()
</script>

<template>
  <UAlert
    v-if="message"
    role="alert"
    class="w-full max-w-sm"
    color="error"
    variant="subtle"
    icon="i-lucide-cloud-off"
    :title="message.title"
    :description="message.description"
    :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', color: 'error', variant: 'outline', loading: retrying, onClick: retry }]"
  />
</template>
