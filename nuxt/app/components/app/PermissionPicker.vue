<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

// value-key="name" makes the palette require a non-optional `name` on each item (the bound value).
type PermissionItem = CommandPaletteItem & { name: string }

// Searchable, grouped-by-resource multi-select of permissions, on Nuxt UI's CommandPalette (fuzzy
// search + keyboard nav for free). v-model is the array of permission NAMES ("user:read"), bound via
// value-key so it drops straight into a role's `permissions`. Used wherever permissions are chosen
// (role create/edit today); pairs with AppPermissionList for read-only display.
const model = defineModel<string[]>({ default: () => [] })

const { all, status } = usePermissionCatalog()

const groups = computed<CommandPaletteGroup<PermissionItem>[]>(() => {
  const byResource = new Map<string, PermissionItem[]>()
  for (const p of all.value) {
    const resource = p.resource || p.name.split(':')[0] || 'other'
    const item: PermissionItem = {
      // `name` is the value (value-key); label/suffix/description drive display + fuzzy search.
      name: p.name,
      label: p.display_name || p.name,
      suffix: p.action || p.name,
      description: p.description || undefined
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
  <div class="flex flex-col rounded-md border border-default">
    <UCommandPalette
      v-model="model"
      multiple
      value-key="name"
      :groups="groups"
      :loading="status === 'pending'"
      placeholder="Search permissions..."
      :fuse="{ fuseOptions: { keys: ['label', 'suffix', 'description'] } }"
      class="h-72"
    />
    <p class="border-t border-default px-3 py-1.5 text-xs text-muted">
      {{ model.length }} permission{{ model.length === 1 ? '' : 's' }} selected
    </p>
  </div>
</template>
