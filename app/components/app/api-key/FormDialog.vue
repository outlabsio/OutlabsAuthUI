<script setup lang="ts">
import type { ApiKeyFormTarget } from '~/composables/useApiKeyFormDialog'
import type { OneTimeSecret } from '~/types/api-key'

// Create, edit or replace a personal API key (display only; logic in useApiKeyFormDialog).
// Sections: identity, access (restriction and scopes), limits.
const props = defineProps<{ target: ApiKeyFormTarget | null }>()
const emit = defineEmits<{ created: [secret: OneTimeSecret] }>()
const open = defineModel<boolean>('open', { default: false })

const {
  schema,
  validate,
  state,
  error,
  mode,
  editedKey,
  dirty,
  title,
  description,
  note,
  submitLabel,
  keyTypeItems,
  keyTypeHelp,
  anchorsShown,
  anchorChoice,
  anchorItems,
  anchorName,
  anchorsLoading,
  scopeOptions,
  scopeFlags,
  scopesStatus,
  scopesError,
  scopesLoading,
  retryScopes,
  scopesHelp,
  scopesEmptyText,
  onSubmit
} = useApiKeyFormDialog(() => props.target, open, {
  created: secret => emit('created', secret)
})
const scopesErrorMessage = useApiErrorMessage(scopesError)
</script>

<template>
  <AppFormDialog
    ref="apiKeyDialog"
    v-model:open="open"
    :title="title"
    :description="description"
    :schema="schema"
    :validate="validate"
    :state="state"
    :error="error"
    :dirty="dirty"
    :require-changes="mode === 'edit'"
    :submit-label="submitLabel"
    size="xl"
    @submit="onSubmit"
  >
    <p class="text-sm text-muted">
      {{ note }}
    </p>

    <section class="flex flex-col gap-4" aria-labelledby="api-key-identity">
      <h3 id="api-key-identity" class="text-sm font-semibold text-highlighted">
        Key
      </h3>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField name="name" label="Name" required>
          <UInput
            id="api-key-name"
            v-model="state.name"
            placeholder="CI pipeline"
            class="w-full"
          />
        </UFormField>
        <UFormField name="description" label="Description" hint="Optional">
          <UInput id="api-key-description" v-model="state.description" class="w-full" />
        </UFormField>
      </div>
      <UFormField
        v-if="mode !== 'edit'"
        name="prefix_type"
        label="Key type"
        required
        :help="keyTypeHelp"
      >
        <URadioGroup
          id="api-key-prefix-type"
          v-model="state.prefix_type"
          :items="keyTypeItems"
          variant="card"
          orientation="horizontal"
          class="w-full"
        />
      </UFormField>
    </section>

    <USeparator />

    <section class="flex flex-col gap-4" aria-labelledby="api-key-access">
      <h3 id="api-key-access" class="text-sm font-semibold text-highlighted">
        Access
      </h3>
      <div v-if="anchorsShown" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField
          name="entity_id"
          label="Restrict to entity"
          hint="Optional"
          help="The key acts only there, even where your access reaches further."
        >
          <USelectMenu
            id="api-key-entity"
            v-model="anchorChoice"
            aria-label="Restrict to entity"
            :items="anchorItems"
            value-key="value"
            :loading="anchorsLoading"
            :search-input="{ placeholder: 'Search your entities...' }"
            class="w-full"
          />
        </UFormField>
        <UFormField v-if="state.entity_id" name="inherit_from_tree">
          <USwitch
            id="api-key-inherit"
            v-model="state.inherit_from_tree"
            label="Include child entities"
            :description="`The key can also act in every entity beneath ${anchorName ?? 'it'}.`"
          />
        </UFormField>
      </div>

      <UFormField
        name="scopes"
        label="Scopes"
        required
        :description="scopesHelp"
      >
        <div v-if="scopesStatus === 'pending'" class="flex flex-col gap-2" role="status">
          <span class="sr-only">Loading scopes</span>
          <USkeleton class="h-7 w-1/2" />
          <USkeleton class="h-56 w-full" />
        </div>
        <UAlert
          v-else-if="scopesStatus === 'error'"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Could not load the scopes you can grant"
          :description="scopesErrorMessage ?? undefined"
          :actions="[{ label: 'Retry', color: 'neutral', variant: 'outline', onClick: retryScopes }]"
        />
        <AppScopePicker
          v-else
          v-model="state.scopes"
          :options="scopeOptions"
          :flags="scopeFlags"
          :loading="scopesLoading"
          :empty-text="scopesEmptyText"
        />
      </UFormField>
    </section>

    <USeparator />

    <section class="flex flex-col gap-4" aria-labelledby="api-key-limits">
      <h3 id="api-key-limits" class="text-sm font-semibold text-highlighted">
        Limits
      </h3>
      <AppApiKeyLimitsFields
        v-model:no-rate-limit="state.no_rate_limit"
        v-model:rate-limit="state.rate_limit_per_minute"
        v-model:expires="state.expires"
        v-model:ip-whitelist="state.ip_whitelist"
        id-prefix="api-key"
        :editing="mode === 'edit'"
        :expires-at="editedKey?.expires_at ?? null"
      />
    </section>
  </AppFormDialog>
</template>
