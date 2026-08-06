<script setup lang="ts">
import type { RuntimeConfig } from '~/utils/runtime-config'

// Unauthenticated shell (A5): login / invite / reset live outside the app guard.
const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
</script>

<template>
  <div class="min-h-svh flex flex-col items-center justify-center gap-6 p-4 bg-muted">
    <div class="flex items-center gap-2 text-lg font-semibold">
      <UIcon name="i-lucide-shield-check" class="size-7 text-primary" />
      <span>{{ runtimeConfig?.authBrand ?? 'OutlabsAuth' }}</span>
    </div>

    <UCard class="w-full max-w-sm">
      <slot />
    </UCard>

    <p class="text-xs text-muted">
      {{ runtimeConfig?.appSubtitle }}
    </p>
  </div>
</template>
