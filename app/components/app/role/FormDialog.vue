<script setup lang="ts">
import type { RoleFormTarget } from '~/composables/useRoleActions'
import type { Role } from '~/types/role'

// Add, edit or duplicate a role (display only; logic in useRoleFormDialog). Type first, then
// where the role lives, its names, its permissions and its settings.
const props = defineProps<{ target: RoleFormTarget }>()
const emit = defineEmits<{ created: [role: Role], saved: [role: Role] }>()
const open = defineModel<boolean>('open', { default: false })

const {
  mode,
  schema,
  state,
  error,
  title,
  submitLabel,
  dirty,
  showType,
  typeItems,
  fixedType,
  editType,
  rootItems,
  anchoredRootId,
  noRoleType,
  entityTypeItems,
  addEntityType,
  scopeItems,
  onNameInput,
  delegationNote,
  selfDemotion,
  removedPermissions,
  isEnterprise,
  onSubmit
} = useRoleFormDialog(() => props.target, open, {
  created: role => emit('created', role),
  saved: role => emit('saved', role)
})

const roleType = computed(() => (mode.value === 'edit' ? editType.value : state.role_type))
const active = computed({
  get: () => state.status === 'active',
  set: (value: boolean) => {
    state.status = value ? 'active' : 'inactive'
  }
})
</script>

<template>
  <AppFormDialog
    ref="roleDialog"
    v-model:open="open"
    :title="title"
    :schema="schema"
    :state="state"
    :error="error"
    :dirty="dirty"
    :require-changes="mode === 'edit'"
    :submit-label="submitLabel"
    :submit-disabled="noRoleType"
    size="xl"
    @submit="onSubmit"
  >
    <UAlert
      v-if="noRoleType"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="There is nowhere you can define a role"
      description="Your account belongs to no organization and holds no system-wide role, so there is no organization or entity to define it at."
      data-testid="role-no-type"
    />
    <UFormField
      v-else-if="showType"
      name="role_type"
      label="Type"
      required
    >
      <URadioGroup
        id="role-type"
        v-model="state.role_type"
        :items="typeItems"
        variant="card"
        class="w-full"
      />
    </UFormField>
    <div v-else-if="fixedType" class="flex flex-wrap items-center gap-2 text-sm" data-testid="role-fixed-type">
      <span class="text-muted">Type</span>
      <UBadge color="neutral" variant="subtle" :label="fixedType.label" />
      <span v-if="fixedType.where" class="text-default">{{ fixedType.where }}</span>
    </div>

    <UFormField
      v-if="showType && state.role_type === 'root'"
      name="root_entity_id"
      label="Organization"
      required
      :help="anchoredRootId ? 'Roles you create belong to your organization.' : undefined"
    >
      <USelectMenu
        id="role-root-entity"
        v-model="state.root_entity_id"
        aria-label="Organization"
        value-key="value"
        :items="rootItems"
        :disabled="Boolean(anchoredRootId)"
        placeholder="Choose an organization"
        class="w-full"
      />
    </UFormField>
    <UFormField
      v-if="showType && state.role_type === 'entity'"
      name="scope_entity_id"
      label="Entity"
      required
      help="The role is defined here and can be granted here and, unless limited below, inside it."
    >
      <AppEntityPicker
        id="role-scope-entity"
        v-model="state.scope_entity_id"
        aria-label="Entity"
        :root-id="anchoredRootId"
        placeholder="Choose an entity"
      />
    </UFormField>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField name="display_name" label="Display name" required>
        <UInput v-model="state.display_name" class="w-full" placeholder="Regional admin" />
      </UFormField>
      <UFormField
        name="name"
        label="Name"
        :required="mode === 'create'"
        :help="mode === 'create' ? 'Lowercase letters, numbers, hyphens or underscores. Fixed after creation.' : 'Fixed after creation.'"
      >
        <UInput
          v-model="state.name"
          class="w-full font-mono"
          placeholder="regional_admin"
          :disabled="mode === 'edit'"
          @input="onNameInput"
        />
      </UFormField>
    </div>
    <UFormField name="description" label="Description" hint="Optional">
      <UTextarea
        v-model="state.description"
        class="w-full"
        :rows="2"
        autoresize
      />
    </UFormField>

    <UAlert
      v-if="delegationNote"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="You can grant only permissions you hold"
      :description="delegationNote"
      data-testid="role-delegation-note"
    />
    <UFormField name="permissions" label="Permissions">
      <AppPermissionPicker v-model="state.permissions" />
    </UFormField>
    <UAlert
      v-if="selfDemotion"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="You hold this role"
      :description="`Removing ${removedPermissions.join(', ')} also takes it away from you, which can lock you out of parts of the console.`"
      data-testid="role-self-demotion"
    />

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="status"
        label="Active"
        description="Inactive roles stay assigned but grant nothing."
      >
        <USwitch v-model="active" aria-label="Active" />
      </UFormField>
      <UFormField
        v-if="isEnterprise && roleType === 'entity'"
        name="is_auto_assigned"
        label="Auto-assign"
        description="Every member in scope gets this role, existing members included."
      >
        <USwitch v-model="state.is_auto_assigned" aria-label="Auto-assign" />
      </UFormField>
    </div>
    <UFormField
      v-if="isEnterprise && roleType === 'entity'"
      name="scope"
      label="Applies to"
    >
      <USelect
        id="role-scope"
        v-model="state.scope"
        :items="scopeItems"
        value-key="value"
        class="w-full"
      />
    </UFormField>
    <UFormField
      v-if="isEnterprise"
      name="assignable_at_types"
      label="Assignable at"
      hint="Optional"
      help="The entity types where memberships may carry this role. Leave empty for any type."
    >
      <USelectMenu
        id="role-assignable-at"
        v-model="state.assignable_at_types"
        aria-label="Assignable at"
        :items="entityTypeItems"
        multiple
        create-item
        placeholder="Any entity type"
        class="w-full"
        @create="addEntityType"
      />
    </UFormField>
  </AppFormDialog>
</template>
