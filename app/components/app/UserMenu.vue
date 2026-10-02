<script setup lang="ts">
// The sidebar footer's user menu (dashboard template idiom). Collapsed, the trigger is the
// avatar alone; the menu offers the same Account, My API keys, Appearance and Sign out.
defineProps<{ collapsed?: boolean }>()

const { items, name, triggerLabel } = useUserMenu()
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'center', collisionPadding: 12 }">
    <UButton
      :avatar="{ alt: name || 'User' }"
      :label="collapsed ? undefined : name"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      :aria-label="triggerLabel"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      data-testid="user-menu"
    />
  </UDropdownMenu>
</template>
