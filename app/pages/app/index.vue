<script setup lang="ts">
// /app has no page of its own: send it to the dashboard instead of a client-side 404. The
// global auth middleware still runs first, so signed-out visitors land on sign-in.
definePageMeta({ redirect: '/app/dashboard' })
</script>

<template>
  <div />
</template>
