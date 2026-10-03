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
  scopesHelp,
  scopesState,
  scopesLoading,
  scopesError,
  retryScopes,
  validate,
  onInvalid,
  submitDisabled,
  onSubmit
} = useServiceAccountFormDialog(() => props.target, open, {
  created: account => emit('created', account)
})
const scopesErrorMessage = useApiErrorMessage(scopesError)
</script>

<template>
  <AppFormDialog
    ref="serviceAccountDialog"
    v-model:open="open"
    :title="title"
    :description="description"
    :schema="schema"
    :validate="validate"
    :state="state"
    :error="error"
    :dirty="dirty"
    :require-changes="mode === 'edit'"
    :submit-disabled="submitDisabled"
    :submit-label="submitLabel"
    size="xl"
    @submit="onSubmit"
    @invalid="onInvalid"
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
          :description="scopesHelp"
        >
          <div class="flex flex-col gap-3">
            <p
              v-if="scopesState === 'pending'"
              role="status"
              class="rounded-md border border-default px-3 py-6 text-center text-sm text-muted"
              data-testid="direct-scopes-loading"
            >
              Loading scopes...
            </p>
            <template v-else>
              <UAlert
                v-if="scopesState === 'error'"
                color="error"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="Could not load the scopes you can grant"
                :description="scopesErrorMessage ?? undefined"
                :actions="[{ label: 'Retry', color: 'neutral', variant: 'outline', loading: scopesLoading, onClick: retryScopes }]"
                data-testid="direct-scopes-error"
              />
              <UAlert
                v-else-if="scopesState === 'denied'"
                color="neutral"
                variant="subtle"
                icon="i-lucide-lock"
                title="You can't grant direct scopes here"
                :description="scopesErrorMessage ?? undefined"
                data-testid="direct-scopes-denied"
              />
              <AppPermissionPicker v-model="state.allowed_scopes" :allow="allowScope" :disabled="scopesState !== 'success'" />
            </template>
          </div>
        </UFormField>
      </template>
    </UCollapsible>
  </AppFormDialog>
</template>
