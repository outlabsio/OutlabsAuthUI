<script setup lang="ts">
// Why the admin landed on sign-in after a forced session end (?reason=). Display only.
const { notice } = useSessionEndNotice()
</script>

<template>
  <UAlert
    v-if="notice"
    role="status"
    :title="notice.title"
    :description="notice.description"
    :color="notice.color"
    :icon="notice.icon"
    variant="subtle"
  />
</template>
