<script setup lang="ts">
// Runtime app-config is resolved by the 00.runtime-config client plugin before the app
// mounts. If it fails to resolve (invalid/missing config in production), we render a hard
// error screen instead of booting against the wrong API — parity with the React app.
const configError = useState<RuntimeConfigError | null>('app:config-error', () => null)
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config', () => null)

const colorMode = useColorMode()
const color = computed(() => (colorMode.value === 'dark' ? '#1b1718' : 'white'))

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  title: () => runtimeConfig.value?.appName ?? 'OutlabsAuth UI'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <AppConfigErrorScreen v-if="configError" :error="configError" />
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
