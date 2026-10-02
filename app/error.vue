<script setup lang="ts">
import type { NuxtError } from '#app'
import { errorPageCopy, errorPageTitle } from '~/utils/error-page'
import { formatDocumentTitle } from '~/utils/page-title'
import type { RuntimeConfig } from '~/utils/runtime-config'

const props = defineProps<{
  error: NuxtError
}>()

// Status-aware copy (404 vs 403 vs 5xx) instead of one "not found" page for everything. Raw
// error messages stay in the console: they are for developers, not for the person who hit
// the page.
const copy = computed(() => errorPageCopy(props.error?.statusCode ?? props.error?.status))
const pageError = computed(() => ({
  statusCode: copy.value.statusCode,
  statusMessage: copy.value.title,
  message: copy.value.description
}))

// Same "<page> · <app name>" form as every other route (app.vue is not mounted here).
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config', () => null)
useSeoMeta({
  title: () => formatDocumentTitle(errorPageTitle(copy.value.statusCode), runtimeConfig.value?.appName),
  description: () => copy.value.description
})

useHead({
  htmlAttrs: {
    lang: 'en'
  }
})

// "/" resolves to the dashboard when signed in and to sign-in otherwise.
function goHome() {
  void clearError({ redirect: '/' })
}

function reload() {
  window.location.reload()
}
</script>

<template>
  <UApp>
    <UError :error="pageError" :clear="false">
      <template #links>
        <UButton size="lg" label="Back to the console" @click="goHome" />
        <UButton
          v-if="copy.retryable"
          size="lg"
          color="neutral"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          label="Reload page"
          @click="reload"
        />
      </template>
    </UError>
  </UApp>
</template>
