<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

// value-key="name" makes the palette require a non-optional `name` on each item (the bound value).
type PermissionItem = CommandPaletteItem & { name: string }

// The permission set of a role being created or edited: the selection first, as removable chips
// (an inactive one flagged, so the admin sees what grants nothing and can remove it, F-069/F-070),
// then a searchable, grouped-by-resource multi-select on Nuxt UI's CommandPalette (fuzzy search
// and keyboard navigation). v-model is the array of permission NAMES ("user:read"), bound via
// value-key so it drops straight into a role's `permissions`. The pool comes from
// useGrantablePermissions: active permissions only; the ones the actor cannot grant are disabled
// with the reason. Pairs with AppPermissionList for read-only display. Never autofocuses: it sits
// inside dialogs whose first field owns the focus (F-131).
// `allow` narrows the offered permissions further (e.g. a service account's direct scopes, which
// the backend limits to its system-key allowlist); a selected permission is always listed.
// While the catalog loads, or when nothing is offered, that is said in place of the palette: its
// listbox may hold options only (its own empty message inside it is invalid ARIA).
const props = withDefaults(defineProps<{
  disabled?: boolean
  allow?: (name: string) => boolean
}>(), { disabled: false, allow: undefined })
const model = defineModel<string[]>({ default: () => [] })

const { permissions, inactive, notHeld, loading, note } = useGrantablePermissions(model)

const inactiveSet = computed(() => new Set(inactive.value))
const notHeldSet = computed(() => new Set(notHeld.value))
const selection = computed(() => [...model.value].sort().map((name) => {
  const flag = inactiveSet.value.has(name) ? 'inactive' : notHeldSet.value.has(name) ? 'not held' : null
  return { name, label: flag ? `${name} (${flag})` : name, flag }
}))
function remove(name: string) {
  model.value = model.value.filter(n => n !== name)
}

const groups = computed<CommandPaletteGroup<PermissionItem>[]>(() => {
  const byResource = new Map<string, PermissionItem[]>()
  const selected = new Set(model.value)
  for (const p of permissions.value) {
    if (props.allow && !selected.has(p.name) && !props.allow(p.name)) continue
    const resource = p.resource || 'other'
    const item: PermissionItem = {
      // `name` is the value (value-key); label/suffix/description drive display + fuzzy search.
      name: p.name,
      label: p.displayName,
      suffix: p.action || p.name,
      description: p.blocked
        ? 'You don\'t hold this permission, so you can\'t grant it.'
        : p.inactive
          ? 'Inactive: grants nothing. Remove it, or activate the permission first.'
          : (p.description || undefined),
      disabled: p.blocked || props.disabled
    }
    const bucket = byResource.get(resource) ?? []
    bucket.push(item)
    byResource.set(resource, bucket)
  }
  return [...byResource.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([resource, items]) => ({
      id: resource,
      label: resource.replace(/[_-]/g, ' '),
      items: items.sort((a, b) => String(a.suffix).localeCompare(String(b.suffix)))
    }))
})
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-2" data-testid="permission-picker">
    <div class="flex min-h-7 flex-wrap items-center gap-1.5" data-testid="permission-selection">
      <UButton
        v-for="item in selection"
        :key="item.name"
        :color="item.flag === 'inactive' ? 'warning' : 'neutral'"
        variant="subtle"
        size="xs"
        trailing-icon="i-lucide-x"
        class="font-mono"
        :label="item.label"
        :aria-label="`Remove ${item.name}`"
        :disabled="disabled"
        @click="remove(item.name)"
      />
      <span v-if="!selection.length" class="text-sm text-muted">No permissions selected.</span>
    </div>
    <div class="flex w-full min-w-0 flex-col rounded-md border border-default">
      <p
        v-if="!groups.length"
        :role="loading ? 'status' : undefined"
        class="h-64 px-3 py-6 text-center text-sm text-muted"
        data-testid="permission-picker-empty"
      >
        {{ loading ? 'Loading permissions...' : 'No permissions to choose from.' }}
      </p>
      <UCommandPalette
        v-else
        v-model="model"
        multiple
        value-key="name"
        :groups="groups"
        :loading="loading"
        :autofocus="false"
        placeholder="Search permissions..."
        :fuse="{ resultLimit: Number.POSITIVE_INFINITY, fuseOptions: { keys: ['name', 'label', 'suffix', 'description'] } }"
        class="h-64"
      />
      <p class="border-t border-default px-3 py-1.5 text-xs text-muted">
        {{ model.length }} permission{{ model.length === 1 ? '' : 's' }} selected<template v-if="note">
          · {{ note }}
        </template>
      </p>
    </div>
  </div>
</template>
