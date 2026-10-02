<script setup lang="ts">
import type { RuntimeConfigError } from '~/utils/runtime-config'

// Hard config-error screen (A1). Rendered by app.vue when runtime config fails to resolve
// in production — the app refuses to boot against an unknown/invalid API instead of
// silently falling back to localhost.
defineProps<{ error: RuntimeConfigError }>()
</script>

<template>
  <div class="min-h-svh flex items-center justify-center p-4 bg-muted">
    <UCard class="w-full max-w-lg">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2 text-error">
          <UIcon name="i-lucide-triangle-alert" class="size-6" />
          <h1 class="text-lg font-semibold">
            Configuration error
          </h1>
        </div>
        <p class="text-sm text-muted">
          {{ error.message }}
        </p>
        <ul v-if="error.issues.length" class="list-disc pl-5 text-sm text-toned space-y-1">
          <li v-for="issue in error.issues" :key="issue">
            {{ issue }}
          </li>
        </ul>
      </div>
    </UCard>
  </div>
</template>
