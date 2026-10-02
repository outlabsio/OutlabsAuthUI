<script setup lang="ts">
import type { ActionError } from '~/composables/useApiAction'

// The in-dialog error surface for a failed action (useApiAction's `inline` ref): what failed,
// the validation problems that could not be shown on a field, and — for a delegation denial —
// the permissions the actor may not grant, as badges, with the roles that carry them. Display
// only; place it at the top of a dialog body.
defineProps<{ error: ActionError | null | undefined }>()
</script>

<template>
  <UAlert
    v-if="error"
    role="alert"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="error.title"
    data-testid="api-error-alert"
  >
    <template #description>
      <div class="space-y-2">
        <p>{{ error.description }}</p>
        <ul v-if="error.issues.length" class="list-disc space-y-0.5 ps-5">
          <li v-for="(issue, index) in error.issues" :key="`${issue.path}-${index}`">
            <span v-if="issue.label" class="font-medium">{{ issue.label }}:</span>
            {{ issue.message }}
          </li>
        </ul>
        <div v-if="error.missingPermissions.length" class="space-y-1">
          <p class="font-medium">
            Missing permissions
          </p>
          <div class="flex flex-wrap gap-1" aria-label="Missing permissions">
            <UBadge
              v-for="name in error.missingPermissions"
              :key="name"
              :label="name"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>
          <p v-if="error.contributingRoles.length">
            Granted through {{ error.contributingRoles.join(', ') }}.
          </p>
        </div>
        <div v-else-if="error.requiredPermissions.length" class="flex flex-wrap gap-1" aria-label="Required permissions">
          <UBadge
            v-for="name in error.requiredPermissions"
            :key="name"
            :label="name"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </div>
      </div>
    </template>
  </UAlert>
</template>
