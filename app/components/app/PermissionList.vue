<script setup lang="ts">
import type { ResolvedPermission } from '~/types/permission'
import { permissionSubAction } from '~/utils/permissions'

// Canonical permission renderer for the whole app: a set of permission NAMES shown grouped by
// resource. `detailed` gives rows with display name + description (role detail, previews); the
// default is compact action badges (chips, tight spaces). Resolves names via the shared catalog, so
// a permission looks the same everywhere. Pure display — the one composable call is the catalog.
//
// Compact badges explain themselves in a tooltip, so they are focusable (a tooltip opens on
// keyboard focus). Tooltips never open on touch, so devices without hover get the detailed
// layout instead, where the names and descriptions are visible (F-132).
const props = withDefaults(defineProps<{
  names?: string[]
  detailed?: boolean
  emptyText?: string
}>(), {
  names: () => [],
  detailed: false,
  emptyText: 'No permissions.'
})

const { groupByResource } = usePermissionCatalog()
const { canAccess } = useAuth()
// Detailed rows link each permission to its page where the actor can read permissions (and,
// on a long list such as a role's, give keyboard users stops inside the scrolling panel).
const permissionPath = (p: ResolvedPermission) => (p.id && canAccess('permissions') ? `/app/permissions/${p.id}` : null)
const groups = computed(() => groupByResource(props.names))
const canHover = useMediaQuery('(hover: hover)')
const showDetailed = computed(() => props.detailed || !canHover.value)

const formatResource = (resource: string) => resource.replace(/[_-]/g, ' ')
const tooltip = (p: ResolvedPermission) => (p.description ? `${p.displayName} — ${p.description}` : p.displayName)
// The full sub-action (everything after the resource) so tree variants read distinctly
// (create vs create_tree), not two badges both labelled with the base action.
const subAction = (p: ResolvedPermission) => permissionSubAction(p)
</script>

<template>
  <p v-if="!names.length" class="text-sm text-muted">
    {{ emptyText }}
  </p>
  <div v-else class="space-y-3">
    <div v-for="group in groups" :key="group.resource">
      <div class="mb-1.5 flex items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-muted">{{ formatResource(group.resource) }}</span>
        <span class="text-xs text-dimmed">{{ group.items.length }}</span>
      </div>

      <div v-if="showDetailed" class="space-y-1.5">
        <div v-for="p in group.items" :key="p.name" class="flex items-baseline gap-2">
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
            class="shrink-0 font-mono"
          >
            {{ subAction(p) }}
          </UBadge>
          <div class="min-w-0 text-sm">
            <ULink v-if="permissionPath(p)" :to="permissionPath(p)!" class="text-default underline">
              {{ p.displayName }}
            </ULink>
            <span v-else class="text-default">{{ p.displayName }}</span>
            <span v-if="p.description" class="text-muted"> — {{ p.description }}</span>
          </div>
        </div>
      </div>

      <div v-else class="flex flex-wrap gap-1.5">
        <UTooltip v-for="p in group.items" :key="p.name" :text="tooltip(p)">
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
            class="font-mono"
            tabindex="0"
          >
            {{ subAction(p) }}
          </UBadge>
        </UTooltip>
      </div>
    </div>
  </div>
</template>
