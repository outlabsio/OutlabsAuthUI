<script setup lang="ts">
import { checkAccessSchema } from '~/schemas/membership'
import type { User } from '~/types/user'

// Check access for one account (display only; logic in useUserCheckAccessDialog).
const props = defineProps<{ user: User }>()
const open = defineModel<boolean>('open', { default: false })
const user = computed(() => props.user)

const {
  state,
  error,
  results,
  allowedCount,
  checkedEntityId,
  permissionItems,
  permissionsLoading,
  addPermission,
  isEnterprise,
  entityPickerRootId,
  entityPickerBlocked,
  onSubmit
} = useUserCheckAccessDialog(user, open)

const permissionSearchInput = { 'placeholder': 'Search or type a permission...', 'aria-label': 'Search permissions' }
</script>

<template>
  <AppFormDialog
    ref="checkAccessDialog"
    v-model:open="open"
    title="Check access"
    :description="`Ask the server whether ${user.email} holds these permissions, everywhere or inside one entity.`"
    :schema="checkAccessSchema"
    :state="state"
    :error="error"
    :dirty="false"
    submit-label="Check access"
    cancel-label="Done"
    size="lg"
    @submit="onSubmit"
  >
    <UFormField
      name="permissions"
      label="Permissions"
      required
      help="Pick from the catalog or type any permission name, such as user:read_tree."
    >
      <USelectMenu
        id="check-access-permissions"
        v-model="state.permissions"
        aria-label="Permissions"
        :items="permissionItems"
        value-key="value"
        multiple
        create-item
        :filter-fields="['label', 'description']"
        :loading="permissionsLoading"
        :search-input="permissionSearchInput"
        placeholder="Choose permissions"
        class="w-full"
        @create="addPermission"
      />
    </UFormField>
    <UFormField
      v-if="isEnterprise"
      name="entityId"
      label="Entity"
      hint="Optional"
      :help="entityPickerBlocked ? 'Neither this user nor your account belongs to an organization, so the check runs across every entity.' : 'Leave empty to check across every entity. Inside an entity, tree permissions held higher up count too.'"
    >
      <AppEntityPicker
        id="check-access-entity"
        v-model="state.entityId"
        aria-label="Entity"
        :root-id="entityPickerRootId"
        :disabled="entityPickerBlocked"
        include-inactive
        placeholder="Every entity"
      />
    </UFormField>

    <div v-if="results" class="space-y-3" data-testid="check-access-results">
      <p role="status" class="text-sm font-medium text-highlighted">
        Holds {{ allowedCount }} of {{ results.length }} {{ checkedEntityId ? 'in this entity' : 'across every entity' }}
      </p>
      <ul class="divide-y divide-default rounded-md border border-default">
        <li
          v-for="row in results"
          :key="row.name"
          class="flex items-center justify-between gap-3 px-3 py-2"
        >
          <span class="min-w-0 break-all font-mono text-sm text-default">{{ row.name }}</span>
          <UBadge
            :color="row.allowed ? 'success' : 'error'"
            variant="subtle"
            size="sm"
            :icon="row.allowed ? 'i-lucide-check' : 'i-lucide-x'"
            :label="row.allowed ? 'Allowed' : 'Denied'"
          />
        </li>
      </ul>
      <p class="text-xs text-muted">
        Role-based answer from the server. ABAC conditions that depend on a request or resource are not evaluated here.
      </p>
    </div>
  </AppFormDialog>
</template>
