<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, InputProps } from '@nuxt/ui'
import { formBusInjectionKey, formFieldInjectionKey } from '#ui/composables/useFormField'

// The scopes of an API key: the selection as removable chips, then a searchable multi-select
// grouped by resource (F-086). Unlike AppPermissionPicker (a role's permissions, pooled from the
// catalog), the options come from the caller: what the server says this key may carry (the
// personal key's grantable scopes, a service account's effective scopes). Names are shown with
// the catalog's display names when the viewer can read it, else from their own parts.
// `flags` marks selected scopes that are no longer offered (name -> short reason), so an edit
// shows what the key carries but could not be granted again; removing them is always allowed.
// While the options load, or when there are none, that is said in place of the palette: its
// listbox may hold options only (its own empty message inside it is invalid ARIA).
type ScopeItem = CommandPaletteItem & { name: string }

const props = withDefaults(defineProps<{
  options: readonly string[]
  flags?: Record<string, string>
  loading?: boolean
  disabled?: boolean
  /** Shown in the list when there is nothing to offer. */
  emptyText?: string
  /** The search box's accessible name (the surrounding UFormField's label). */
  label?: string
}>(), { flags: () => ({}), loading: false, disabled: false, emptyText: 'No scopes to offer.', label: 'Scopes' })
const model = defineModel<string[]>({ default: () => [] })

const { resolve } = usePermissionCatalog()

// The picker is its UFormField's input. A selection the admin changes (an option picked, a chip
// removed) is reported to the surrounding UForm as a change, like any Nuxt UI input's, so the
// field validates again and a rule that depends on the selection (a scope no longer offered, an
// AppFormDialog `validate` rule) follows it at once. Same integration point as AppDateField.
const formBus = inject(formBusInjectionKey, undefined)
const formField = inject(formFieldInjectionKey, undefined)
function reportChange() {
  const name = formField?.value?.name
  if (formBus && name) formBus.emit({ type: 'change', name })
}
function select(names: string[]) {
  model.value = names
  reportChange()
}
// The palette's v-model: the selection, written through select().
const selected = computed({
  get: () => model.value,
  set: select
})

const selection = computed(() => [...model.value].sort().map((name) => {
  const flag = props.flags[name] ?? null
  return { name, label: flag ? `${name} (${flag})` : name, flag }
}))
function remove(name: string) {
  select(model.value.filter(n => n !== name))
}

const groups = computed<CommandPaletteGroup<ScopeItem>[]>(() => {
  const byResource = new Map<string, ScopeItem[]>()
  const names = new Set([...props.options, ...model.value])
  for (const name of names) {
    const p = resolve(name)
    const flag = props.flags[name]
    const item: ScopeItem = {
      name,
      label: p.displayName,
      suffix: p.action || name,
      description: flag ? `Selected, but ${flag}.` : (p.description || undefined),
      disabled: props.disabled
    }
    const resource = p.resource || 'other'
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
const empty = computed(() => !props.loading && !groups.value.length)
// HTML attributes reach the search <input> but are not part of InputProps' declared type.
const searchInput = computed(() => ({ 'aria-label': props.label }) as InputProps)
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-2" data-testid="scope-picker">
    <div class="flex min-h-7 flex-wrap items-center gap-1.5" data-testid="scope-selection">
      <UButton
        v-for="item in selection"
        :key="item.name"
        :color="item.flag ? 'warning' : 'neutral'"
        variant="subtle"
        size="xs"
        trailing-icon="i-lucide-x"
        class="font-mono"
        :label="item.label"
        :aria-label="`Remove ${item.name}`"
        :disabled="disabled"
        @click="remove(item.name)"
      />
      <span v-if="!selection.length" class="text-sm text-muted">No scopes selected.</span>
    </div>
    <div class="flex w-full min-w-0 flex-col rounded-md border border-default">
      <p v-if="loading && !groups.length" role="status" class="h-56 px-3 py-6 text-center text-sm text-muted">
        Loading scopes...
      </p>
      <p v-else-if="empty" class="px-3 py-6 text-center text-sm text-muted" data-testid="scope-picker-empty">
        {{ emptyText }}
      </p>
      <UCommandPalette
        v-else
        v-model="selected"
        multiple
        value-key="name"
        :groups="groups"
        :loading="loading"
        :autofocus="false"
        placeholder="Search scopes..."
        :input="searchInput"
        :fuse="{ resultLimit: Number.POSITIVE_INFINITY, fuseOptions: { keys: ['name', 'label', 'suffix', 'description'] } }"
        class="h-56"
      />
      <p class="border-t border-default px-3 py-1.5 text-xs text-muted">
        {{ model.length }} scope{{ model.length === 1 ? '' : 's' }} selected
      </p>
    </div>
  </div>
</template>
