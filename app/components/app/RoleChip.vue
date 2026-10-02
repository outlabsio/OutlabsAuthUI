<script setup lang="ts">
import type { RoleReference } from '~/types/role'

// A role shown as a chip; activate it (click, tap, Enter or Space) to see the permissions it
// grants. The one consistent way to display a role app-wide. Pass every name the payload
// carries ({ id, display_name } from RoleSummary, or the membership history's role_names):
// names from the payload win, the role catalog fills the gaps, and a role nobody names shows
// as "Unknown role" with its id inside the popover, never as a raw id (F-067). While a source that
// may still name it, or list its permissions, is loading, the chip (aria-busy) and popover say so
// instead.
// The popover lists the permissions `detailed` (names and descriptions in the open): compact
// badges would be focusable tooltip triggers, and opening the popover would focus the first one
// and pop its tooltip over the list. The scrolling list itself takes the focus instead, so the
// arrow keys scroll it.
const props = defineProps<{
  role: RoleReference
}>()

const { describe } = useRoleCatalog()
const described = computed(() => describe(props.role))
</script>

<template>
  <UPopover>
    <UButton
      color="neutral"
      variant="subtle"
      size="xs"
      :label="described.label"
      :aria-busy="described.loading || undefined"
      data-testid="role-chip"
    />
    <template #content>
      <div class="w-80 max-w-full p-3">
        <div class="mb-1.5 flex items-center gap-2">
          <span class="text-sm font-medium text-highlighted">{{ described.label }}</span>
          <span v-if="described.permissions" class="text-xs text-dimmed">{{ described.permissions.length }} perms</span>
        </div>
        <p v-if="described.loading" class="text-sm text-muted">
          {{ described.known ? 'Loading its permissions...' : 'Loading this role...' }}
        </p>
        <p v-else-if="!described.known" class="text-sm text-muted">
          This role is outside the roles you can read.
          <span class="block font-mono text-xs text-dimmed">{{ described.id }}</span>
        </p>
        <p v-else-if="!described.permissions" class="text-sm text-muted">
          Its permissions are not visible to you.
        </p>
        <div
          v-else
          class="max-h-64 overflow-y-auto rounded-md p-1"
          tabindex="0"
          role="region"
          :aria-label="`${described.label} permissions`"
          data-testid="role-chip-permissions"
        >
          <AppPermissionList :names="described.permissions" detailed empty-text="Grants no permissions." />
        </div>
      </div>
    </template>
  </UPopover>
</template>
