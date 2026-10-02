<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { Role, RoleType } from '~/types/role'

// Searchable multi-select of roles on Nuxt UI's CommandPalette — same look as AppPermissionPicker.
// v-model is the role-id array (value-key). The pool is passed in: build it with
// useAssignableRoles so it holds only roles the backend accepts for the target. Each row shows the
// role, its permission count and, when `showType`, its type badge (System-wide / Organization /
// Entity); the description stays secondary. A role the actor cannot delegate (non-empty
// `missingPermissions`) is listed but disabled, with the reason in place of the description;
// if it is already selected it stays enabled so it can still be removed.
// Never autofocuses: it sits inside dialogs whose first field owns the focus (F-131).
// `truncated` (the pool's flag) says in the footer that not every role could be loaded, so a
// capped list is never passed off as complete.
// While the pool loads ("Loading roles...") or offers nothing (`emptyText`), that is said in place
// of the palette: the palette's listbox may hold options only, and its own empty message sits
// inside it, which is invalid ARIA (aria-required-children) for as long as it shows.
type PickerRole = Role & { type?: RoleType, missingPermissions?: string[] }
type RoleItem = CommandPaletteItem & { id: string }

const props = withDefaults(defineProps<{
  roles?: PickerRole[]
  showType?: boolean
  disabled?: boolean
  loading?: boolean
  // Shown when the pool is empty (e.g. "Choose an entity first").
  emptyText?: string
  truncated?: boolean
  heightClass?: string
}>(), {
  roles: () => [],
  showType: false,
  disabled: false,
  loading: false,
  emptyText: 'No roles to choose from.',
  truncated: false,
  heightClass: 'h-72'
})
const model = defineModel<string[]>({ default: () => [] })
// Type badge text per role id (the palette's slot props are loosely typed, so look it up by id).
const typeLabelById = computed(() => new Map(props.roles.map(r => [r.id, ROLE_TYPE_LABELS[r.type ?? roleTypeOf(r)]])))

const groups = computed<CommandPaletteGroup<RoleItem>[]>(() => [{
  id: 'roles',
  items: props.roles.map((r) => {
    const missing = r.missingPermissions ?? []
    return {
      id: r.id,
      label: r.display_name || r.name,
      suffix: `${r.permissions?.length ?? 0} perms`,
      description: missing.length ? delegationBlockedReason(missing) : (r.description || undefined),
      disabled: missing.length > 0 && !model.value.includes(r.id)
    }
  })
}])
</script>

<template>
  <div class="flex w-full min-w-0 flex-col rounded-md border border-default" :class="heightClass">
    <p
      v-if="!roles.length"
      :role="loading ? 'status' : undefined"
      class="min-h-0 flex-1 px-3 py-6 text-center text-sm text-muted"
      data-testid="role-picker-empty"
    >
      {{ loading ? 'Loading roles...' : emptyText }}
    </p>
    <UCommandPalette
      v-else
      v-model="model"
      multiple
      value-key="id"
      :groups="groups"
      :disabled="disabled"
      :loading="loading"
      :autofocus="false"
      placeholder="Search roles..."
      :fuse="{ resultLimit: Number.POSITIVE_INFINITY, fuseOptions: { keys: ['label', 'description', 'suffix'] } }"
      class="min-h-0 flex-1"
    >
      <template v-if="showType" #item-trailing="{ item }">
        <UBadge
          v-if="typeLabelById.get(item.id)"
          color="neutral"
          variant="outline"
          size="sm"
          :label="typeLabelById.get(item.id)"
        />
      </template>
      <template #empty="{ searchTerm }">
        <span class="text-sm text-muted">{{ searchTerm ? `No roles match "${searchTerm}".` : emptyText }}</span>
      </template>
    </UCommandPalette>
    <div class="flex flex-wrap items-center justify-between gap-x-3 border-t border-default px-3 py-1.5 text-xs text-muted">
      <span>{{ model.length }} role{{ model.length === 1 ? '' : 's' }} selected</span>
      <span v-if="truncated" data-testid="role-picker-truncated">Not every role could be loaded.</span>
    </div>
  </div>
</template>
