<script setup lang="ts">
// Retired standalone page: requesting a password-reset link is the email branch of the
// "Can't sign in?" recovery flow. Old links (and bookmarks) land there, keeping ?redirect.
definePageMeta({
  layout: 'auth',
  middleware: to => navigateTo({ path: '/auth/recovery', query: to.query }, { replace: true })
})
</script>

<template>
  <div />
</template>
