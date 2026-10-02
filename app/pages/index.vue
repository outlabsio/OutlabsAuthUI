<script setup lang="ts">
definePageMeta({ layout: false })

// Root redirect. The global auth middleware also enforces this, but resolving here keeps the
// very first paint from flashing an empty shell. Reads the Colada-owned session.
const { isAuthenticated } = useAuth()
await navigateTo(isAuthenticated.value ? '/app/dashboard' : '/auth/login', { replace: true })
</script>

<template>
  <div />
</template>
