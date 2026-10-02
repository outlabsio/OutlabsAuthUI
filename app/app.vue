<script setup lang="ts">
import { formatDocumentTitle, routeFallbackTitle } from '~/utils/page-title'
import { themeColorFor } from '~/utils/theme-color'

// Runtime app-config is resolved by the 00.runtime-config client plugin before the app
// mounts. If it fails to resolve (invalid/missing config in production), we render a hard
// error screen instead of booting against the wrong API.
// The same screen blocks a backend whose api_contract_version this console doesn't support.
const blockingError = useAppConfigError()
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config', () => null)
// A stored session whose API did not answer at boot: keep it and offer Retry.
const bootError = useState<BootError | null>('app:boot-error', () => null)

// Browser chrome follows the page background (white / the neutral palette's 900 in dark mode).
const colorMode = useColorMode()
const appConfig = useAppConfig()
const themeColor = computed(() => themeColorFor(colorMode.value, appConfig.ui?.colors?.neutral))

const route = useRoute()

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: themeColor }
  ],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' },
  // Every route has its own title (F-130): "<page> · <app name>". This entry is the fallback
  // (the route's section or guest page); record pages refine it with usePageMeta.
  title: () => routeFallbackTitle(route.path),
  titleTemplate: title => formatDocumentTitle(title, runtimeConfig.value?.appName)
})

// Reduced motion (F-224): dialogs, slideovers and the mobile drawer open without their
// scale/slide transitions for people who ask the OS for less motion. UTheme sets these as
// component defaults; an explicit prop on a component still wins.
const reducedMotion = usePreferredReducedMotion()
const motionDefaults = computed(() => reducedMotion.value === 'reduce'
  ? { modal: { transition: false }, slideover: { transition: false }, dashboardSearch: { transition: false } }
  : {})
</script>

<template>
  <UApp>
    <UTheme :props="motionDefaults">
      <NuxtLoadingIndicator />
      <!-- Announces the new document title after each client-side navigation. -->
      <NuxtRouteAnnouncer />

      <AppConfigErrorScreen v-if="blockingError" :error="blockingError" />
      <AppApiUnreachableScreen v-else-if="bootError" />
      <NuxtLayout v-else>
        <NuxtPage />
      </NuxtLayout>
    </UTheme>
  </UApp>
</template>
