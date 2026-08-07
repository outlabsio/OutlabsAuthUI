<script setup lang="ts">
import { useQueryCache } from '@pinia/colada'
import { finalizeAuth } from '~/queries/session'
import { getApiErrorMessage } from '~/api/client'

definePageMeta({ layout: 'auth' })

const queryCache = useQueryCache()
const error = ref('')

// The provider redirects back with tokens in the URL hash (#access_token=…&refresh_token=…).
function readOAuthTokensFromHash() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return null
  return { access_token, refresh_token, token_type: params.get('token_type') || 'bearer' }
}

onMounted(async () => {
  const tokens = readOAuthTokensFromHash()
  if (!tokens) {
    error.value = 'Sign-in did not return a usable session.'
    return
  }
  try {
    await finalizeAuth(queryCache, tokens)
    // Strip the tokens back out of the URL before leaving.
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
    await navigateTo('/app/dashboard', { replace: true })
  } catch (err) {
    error.value = getApiErrorMessage(err)
  }
})
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-4 text-center">
    <template v-if="error">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <h1 class="text-lg font-semibold text-highlighted">
        Sign-in failed
      </h1>
      <p class="text-sm text-muted">
        {{ error }}
      </p>
      <ULink to="/auth/login" class="text-sm text-muted hover:text-default">
        Back to sign in
      </ULink>
    </template>
    <template v-else>
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
      <p class="text-sm text-muted">
        Completing sign in...
      </p>
    </template>
  </div>
</template>
