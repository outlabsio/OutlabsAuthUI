<script setup lang="ts">
import { MAIN_CONTENT_ID } from '~/navigation/panel-memory'
import type { RuntimeConfig } from '~/utils/runtime-config'

// Unauthenticated shell (A5): sign-in, recovery, invite and reset live outside the app guard.
// The logo has a light and a dark source (UColorModeImage): the default ships a light-ink
// variant for dark mode, and a deployment can set authLogoDarkUrl for its own. The page is one
// main landmark with the same id as the console's (F-130), so assistive technology and the
// route announcer find the content the same way on every page.
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
const logo = computed(() => ({
  light: runtimeConfig.value?.authLogoUrl ?? '/brand/outlabs-auth-logo.svg',
  dark: runtimeConfig.value?.authLogoDarkUrl ?? '/brand/outlabs-auth-logo-dark.svg',
  alt: runtimeConfig.value?.authBrand ?? 'OutlabsAuth'
}))
</script>

<template>
  <main :id="MAIN_CONTENT_ID" tabindex="-1" class="min-h-svh flex flex-col items-center justify-center gap-6 p-4 bg-muted focus:outline-none">
    <UColorModeImage
      :light="logo.light"
      :dark="logo.dark"
      :alt="logo.alt"
      class="h-14 w-auto max-w-64 object-contain"
    />

    <AppAuthApiAlert />

    <UCard class="w-full max-w-sm">
      <slot />
    </UCard>

    <p v-if="runtimeConfig?.appSubtitle" class="text-xs text-muted">
      {{ runtimeConfig.appSubtitle }}
    </p>
  </main>
</template>
