<script setup lang="ts">
// The entity detail is now the right-hand column of the master-detail at
// /app/entities?entity=<id>. This legacy deep-link route redirects there so bookmarks,
// inbound links, and old tree-node URLs keep working.
definePageMeta({
  middleware: to => navigateTo(
    { path: '/app/entities', query: { entity: String(to.params.entityId) } },
    { replace: true }
  )
})
</script>

<template>
  <div />
</template>
