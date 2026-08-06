<script setup lang="ts">
import { useSessionStore } from '~/stores/session'

definePageMeta({ layout: false })

// Root redirect. The global auth middleware also enforces this, but resolving here keeps
// the very first paint from flashing an empty shell.
const session = useSessionStore()
await navigateTo(session.isAuthenticated ? '/app/dashboard' : '/auth/login', { replace: true })
</script>

<template>
  <div />
</template>
