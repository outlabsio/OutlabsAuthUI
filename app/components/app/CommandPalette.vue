<script setup lang="ts">
// Global search / command palette (F-212): UDashboardSearch, opened with Cmd/Ctrl+K or the
// sidebar's Search button. Groups and gating live in useCommandPalette.
const { open, searchTerm, groups, loading, placeholder } = useCommandPalette()
</script>

<template>
  <UDashboardSearch
    v-model:open="open"
    v-model:search-term="searchTerm"
    :groups="groups"
    :loading="loading"
    :placeholder="placeholder"
    title="Search the console"
    description="Jump to a page or a record, or run an action."
  />
</template>
