<script setup lang="ts">
import type { Role, RoleReference, RoleType } from '~/types/role'
import type { RoleAccessGrant } from '~/composables/useRoleAccessEditor'

// The role-assignment workspace every access-granting dialog uses: the current selection as
// removable chips, the searchable pool, and what the selection will grant — side by side from
// `sm`, stacked below it, each in a fixed-height scroll box so the dialog's validity and reason
// fields stay in view (F-031). Build `roles` with useAssignableRoles and pass its status through
// `disabled` / `loading` / `empty-text`. `grant="direct"` marks direct user grants: selecting a
// system-wide role there warns that it reaches every organization (F-009). `known` passes the
// names a payload already carries for the current selection (e.g. a member's RoleSummary list)
// so roles outside the pool still get a readable chip. `truncated` (the pool's own flag) notes
// that the list is incomplete. `collapse-when-empty` shows only the empty text (pass the pool's
// `emptyText`: "Loading roles..." while pending) instead of an empty picker and preview while the
// pool offers nothing and nothing is selected — for an optional Roles section such as Invite.
const props = withDefaults(defineProps<{
  roles?: (Role & { type?: RoleType, missingPermissions?: string[] })[]
  grant?: RoleAccessGrant
  known?: RoleReference[]
  disabled?: boolean
  loading?: boolean
  emptyText?: string
  truncated?: boolean
  collapseWhenEmpty?: boolean
}>(), {
  roles: () => [],
  grant: 'membership',
  known: undefined,
  disabled: false,
  loading: false,
  emptyText: undefined,
  truncated: false,
  collapseWhenEmpty: false
})

const model = defineModel<string[]>({ default: () => [] })

const { selection, selectedRoles, crossTenantWarning, showType, nothingToOffer, remove } = useRoleAccessEditor({
  model,
  roles: () => props.roles,
  known: () => props.known,
  grant: () => props.grant
})
</script>

<template>
  <p
    v-if="collapseWhenEmpty && nothingToOffer"
    class="text-sm text-muted"
    data-testid="role-access-empty"
  >
    {{ emptyText ?? 'No roles to choose from.' }}
  </p>
  <div v-else class="flex w-full min-w-0 flex-col gap-3" data-testid="role-access-editor">
    <div class="flex min-h-7 flex-wrap items-center gap-1.5" data-testid="role-access-selection">
      <UButton
        v-for="item in selection"
        :key="item.id"
        color="neutral"
        variant="subtle"
        size="xs"
        trailing-icon="i-lucide-x"
        :label="item.label"
        :aria-label="`Remove ${item.label}`"
        :disabled="disabled"
        @click="remove(item.id)"
      />
      <span v-if="!selection.length" class="text-sm text-muted">No roles selected.</span>
    </div>

    <UAlert
      v-if="crossTenantWarning"
      color="warning"
      variant="subtle"
      icon="i-lucide-globe"
      :title="crossTenantWarning.title"
      :description="crossTenantWarning.description"
      data-testid="role-access-cross-tenant"
    />

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AppRolePicker
        v-model="model"
        :roles="roles"
        :show-type="showType"
        :disabled="disabled"
        :loading="loading"
        :empty-text="emptyText"
        :truncated="truncated"
        height-class="h-72"
      />
      <div class="h-48 min-w-0 overflow-y-auto rounded-md border border-default p-3 sm:h-72">
        <AppEffectivePermissions :roles="selectedRoles" />
      </div>
    </div>
  </div>
</template>
