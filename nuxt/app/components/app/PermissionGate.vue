<script setup lang="ts">
// RBAC gate — renders its slot only if the actor holds (any of) the given permission(s);
// otherwise shows an in-place "Insufficient permissions" state (no redirect, matching the
// React app). Superusers always pass (handled in useAuth().hasAnyPermission).
const props = defineProps<{ permission: string | string[] }>()

const { hasAnyPermission } = useAuth()
const allowed = computed(() =>
  hasAnyPermission(Array.isArray(props.permission) ? props.permission : [props.permission])
)
</script>

<template>
  <slot v-if="allowed" />
  <div v-else class="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <UIcon name="i-lucide-lock" class="size-8 text-muted" />
    <h2 class="text-base font-medium text-default">
      Insufficient permissions
    </h2>
    <p class="text-sm text-muted">
      You don't have access to this section.
    </p>
  </div>
</template>
