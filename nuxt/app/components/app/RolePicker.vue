<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { Role } from '~/types/role'

// Searchable multi-select of roles on Nuxt UI's CommandPalette — same look as AppPermissionPicker.
// Each row shows the role + a permission-count suffix; v-model is the role-id array (value-key). The
// assignable pool is passed in (callers scope it, e.g. to an entity's org). Pair with
// AppEffectivePermissions to show what the selected roles grant.
type RoleItem = CommandPaletteItem & { id: string }

const props = withDefaults(defineProps<{ roles?: Role[], heightClass?: string }>(), { roles: () => [], heightClass: 'h-72' })
const model = defineModel<string[]>({ default: () => [] })

const groups = computed<CommandPaletteGroup<RoleItem>[]>(() => [{
  id: 'roles',
  items: [...props.roles]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map(r => ({
      id: r.id,
      label: r.display_name,
      suffix: `${r.permissions?.length ?? 0} perms`,
      description: r.description || (r.is_global ? 'Global' : 'Scoped')
    }))
}])
</script>

<template>
  <div class="flex flex-col rounded-md border border-default" :class="heightClass">
    <UCommandPalette
      v-model="model"
      multiple
      value-key="id"
      :groups="groups"
      placeholder="Search roles..."
      :fuse="{ fuseOptions: { keys: ['label', 'description', 'suffix'] } }"
      class="min-h-0 flex-1"
    />
    <p class="border-t border-default px-3 py-1.5 text-xs text-muted">
      {{ model.length }} role{{ model.length === 1 ? '' : 's' }} selected
    </p>
  </div>
</template>
