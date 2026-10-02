<script setup lang="ts">
import type { ServiceAccountFormTarget } from '~/composables/useServiceAccountActions'
import type { IntegrationPrincipal } from '~/types/api-key'

// New or edit a service account (display only; logic in useServiceAccountFormDialog). Its name,
// then what its keys may do: roles first, direct scopes under Advanced (restricted).
const props = defineProps<{ target: ServiceAccountFormTarget | null }>()
const emit = defineEmits<{ created: [account: IntegrationPrincipal] }>()
const open = defineModel<boolean>('open', { default: false })

const {
  mode,
  schema,
  state,
  error,
  title,
  description,
  submitLabel,
  dirty,
  isEntity,
  anchorName,
  rolesPool,
  rolesPoolStatus,
  rolesPoolEmptyText,
  rolesPoolTruncated,
  knownRoles,
  scopesOpen,
  allowScope,
  onSubmit
} = useServiceAccountFormDialog(() => props.target, open, {
  created: account => emit('created', account)
})
</script>

<template>
  <AppFormDialog
    ref="serviceAccountDialog"
    v-model:open="open"
    :title="title"
    :description="description"
    :schema="schema"
    :state="state"
    :error="error"
    :dirty="dirty"
    :require-changes="mode === 'edit'"
    :submit-label="submitLabel"
    size="xl"
    @submit="onSubmit"
  >
    <UFormField
      name="name"
      label="Name"
      required
      help="Name the integration or system that will use its keys."
    >
      <UInput
        id="service-account-name"
        v-model="state.name"
        class="w-full"
        placeholder="ci-deployer"
      />
    </UFormField>
    <UFormField name="description" label="Description" hint="Optional">
      <UTextarea
        id="service-account-description"
        v-model="state.description"
        class="w-full"
        :rows="2"
        autoresize
      />
    </UFormField>

    <UFormField v-if="isEntity" name="inherit_from_tree">
      <USwitch
        id="service-account-inherit"
        v-model="state.inherit_from_tree"
        label="Includes child entities"
        :description="`Its keys can also act in every entity beneath ${anchorName ?? 'the anchor'}, not only there.`"
      />
    </UFormField>

    <UFormField
      name="role_ids"
      label="Roles"
      description="What its keys can do: they get at most the permissions these roles grant."
    >
      <AppRoleAccessEditor
        v-model="state.role_ids"
        :roles="rolesPool"
        :known="knownRoles"
        :loading="rolesPoolStatus === 'pending'"
        :disabled="rolesPoolStatus === 'denied'"
        :empty-text="rolesPoolEmptyText"
        :truncated="rolesPoolTruncated"
      />
    </UFormField>

    <UCollapsible v-model:open="scopesOpen" :unmount-on-hide="false" class="flex flex-col gap-4">
      <UButton
        color="neutral"
        variant="link"
        :label="scopesOpen ? 'Hide direct scopes' : 'Advanced: direct scopes'"
        :trailing-icon="scopesOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="self-start px-0"
      />
      <template #content>
        <UFormField
          name="allowed_scopes"
          label="Direct scopes"
          hint="Restricted"
          description="Permissions given without a role. Prefer roles; add a direct scope only for a narrow integration. You can grant only what you hold, and never key or service-account management."
        >
          <AppPermissionPicker v-model="state.allowed_scopes" :allow="allowScope" />
        </UFormField>
      </template>
    </UCollapsible>
  </AppFormDialog>
</template>
