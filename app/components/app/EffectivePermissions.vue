<script setup lang="ts">
import type { Role } from '~/types/role'

// What a set of roles will grant — the answer that sits beside AppRolePicker. The union of the
// permissions of the roles that can grant anything, rendered through AppPermissionList so it
// reads like every other permission view. Caveats are spelled out instead of hidden in the union
// (F-178): inactive roles grant nothing, entity-only roles stop at their entity, and roles with
// ABAC conditions grant only when the conditions hold. Any caveat retitles it "Grants up to".
const props = withDefaults(defineProps<{
  roles?: Role[]
  // Overrides the automatic "Will grant" / "Grants up to" heading.
  title?: string
  emptyText?: string
}>(), {
  roles: () => [],
  title: undefined,
  emptyText: 'Select roles to see the permissions they grant.'
})

const { caveatRows, hasCaveats, names } = useGrantPreview(() => props.roles)

const heading = computed(() => props.title ?? (hasCaveats.value ? 'Grants up to' : 'Will grant'))

function caveatText(row: { role: Role, inactive: boolean, entityOnly: boolean, conditional: boolean }) {
  if (row.inactive) return 'Inactive: grants nothing.'
  const parts: string[] = []
  if (row.entityOnly) parts.push(`Only at ${row.role.scope_entity_name || 'its own entity'}, not below it.`)
  if (row.conditional) parts.push('Only when its conditions hold.')
  return parts.join(' ')
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3" data-testid="grant-preview">
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium uppercase tracking-wide text-muted">{{ heading }}</span>
      <span class="text-xs text-dimmed">{{ names.length }}</span>
    </div>

    <p v-if="!roles.length" class="text-sm text-muted">
      {{ emptyText }}
    </p>

    <template v-else>
      <ul v-if="hasCaveats" class="space-y-2" data-testid="grant-preview-caveats">
        <li v-for="row in caveatRows" :key="row.role.id" class="space-y-0.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-sm" :class="row.inactive ? 'text-dimmed' : 'text-default'">{{ row.role.display_name || row.role.name }}</span>
            <UBadge
              v-if="row.inactive"
              color="neutral"
              variant="outline"
              size="sm"
              label="Inactive"
            />
            <UBadge
              v-if="row.entityOnly"
              color="neutral"
              variant="outline"
              size="sm"
              label="Entity only"
            />
            <UBadge
              v-if="row.conditional"
              color="neutral"
              variant="outline"
              size="sm"
              label="Conditional"
            />
          </div>
          <p class="text-xs text-muted">
            {{ caveatText(row) }}
          </p>
        </li>
      </ul>

      <AppPermissionList :names="names" empty-text="These roles grant no permissions." />
    </template>
  </div>
</template>
