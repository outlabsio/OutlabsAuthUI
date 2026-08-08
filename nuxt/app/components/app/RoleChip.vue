<script setup lang="ts">
// A role shown as a chip; hover to see the permissions it grants (via AppPermissionList). Accepts a
// role summary — id is enough; display name + permissions are resolved from the shared role catalog
// when not embedded on the passed object. The one consistent way to display a role app-wide.
const props = defineProps<{
  role: { id: string, display_name?: string | null, name?: string | null, permissions?: string[] }
}>()

const { roleById } = useRoleCatalog()
const resolved = computed(() => roleById.value.get(props.role.id))
const label = computed(() => props.role.display_name || resolved.value?.display_name || props.role.name || resolved.value?.name || props.role.id)
const permissions = computed(() => props.role.permissions ?? resolved.value?.permissions ?? [])
</script>

<template>
  <UPopover mode="hover" :open-delay="150" :close-delay="100">
    <UBadge
      color="neutral"
      variant="subtle"
      size="sm"
      class="cursor-default"
    >
      {{ label }}
    </UBadge>
    <template #content>
      <div class="w-72 p-3">
        <div class="mb-1.5 flex items-center gap-2">
          <span class="text-sm font-medium text-highlighted">{{ label }}</span>
          <span class="text-xs text-dimmed">{{ permissions.length }} perms</span>
        </div>
        <div class="max-h-64 overflow-y-auto">
          <AppPermissionList :names="permissions" empty-text="Grants no permissions." />
        </div>
      </div>
    </template>
  </UPopover>
</template>
