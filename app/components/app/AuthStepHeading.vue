<script setup lang="ts">
// The heading of one guest-flow step (sign-in, recovery, invite…): the page's h1, focusable
// (tabindex -1) so useAuthStepFocus can move focus to it when the step changes and screen
// readers announce the new step. One per rendered step.
defineProps<{
  title: string
  description?: string
}>()

const headingId = AUTH_STEP_HEADING_ID
</script>

<template>
  <div class="space-y-1">
    <h1 :id="headingId" tabindex="-1" class="text-lg font-semibold text-highlighted">
      {{ title }}
    </h1>
    <p v-if="description || $slots.description" class="text-sm text-muted">
      <slot name="description">
        {{ description }}
      </slot>
    </p>
  </div>
</template>
