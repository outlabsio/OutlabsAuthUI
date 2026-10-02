<script setup lang="ts">
// A grant's validity window (a direct role assignment or a membership), as whole days: "From",
// "Until", or "No limit" when neither is set. Display only.
defineProps<{ validFrom?: string | null, validUntil?: string | null }>()
</script>

<template>
  <span v-if="!validFrom && !validUntil" class="text-sm text-muted">No limit</span>
  <span v-else class="block text-sm">
    <span v-if="validFrom" class="block">From <AppTimestamp :value="validFrom" date-only /></span>
    <span v-if="validUntil" class="block">Until <AppTimestamp :value="validUntil" date-only /></span>
    <span v-else class="block text-muted">No end date</span>
  </span>
</template>
