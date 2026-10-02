<script setup lang="ts">
import type { ApiKey, IntegrationPrincipal, OneTimeSecret } from '~/types/api-key'

// New key or edit a key of a service account (display only; logic in useServiceAccountKeyDialog).
const props = withDefaults(defineProps<{ account: IntegrationPrincipal, target?: ApiKey | null }>(), { target: null })
const emit = defineEmits<{ created: [secret: OneTimeSecret] }>()
const open = defineModel<boolean>('open', { default: false })
const account = computed(() => props.account)
const target = computed(() => props.target)

const {
  schema,
  validate,
  state,
  error,
  editing,
  dirty,
  scopeOptions,
  scopeFlags,
  keyTypeItems,
  keyTypeHelp,
  title,
  submitLabel,
  description,
  note,
  onSubmit
} = useServiceAccountKeyDialog(account, target, open, {
  created: secret => emit('created', secret)
})
</script>

<template>
  <AppFormDialog
    ref="keyDialog"
    v-model:open="open"
    :title="title"
    :description="description"
    :schema="schema"
    :validate="validate"
    :state="state"
    :error="error"
    :dirty="dirty"
    :require-changes="editing"
    :submit-label="submitLabel"
    size="xl"
    @submit="onSubmit"
  >
    <p class="text-sm text-muted">
      {{ note }}
    </p>

    <section class="flex flex-col gap-4" aria-labelledby="key-section-identity">
      <h3 id="key-section-identity" class="text-sm font-semibold text-highlighted">
        Key
      </h3>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField name="name" label="Name" required>
          <UInput
            id="key-name"
            v-model="state.name"
            class="w-full"
            placeholder="prod-deploy"
          />
        </UFormField>
        <UFormField name="description" label="Description" hint="Optional">
          <UInput id="key-description" v-model="state.description" class="w-full" />
        </UFormField>
      </div>

      <UFormField
        v-if="!editing"
        name="prefix_type"
        label="Key type"
        required
        :help="keyTypeHelp"
      >
        <URadioGroup
          id="key-type"
          v-model="state.prefix_type"
          :items="keyTypeItems"
          variant="card"
          orientation="horizontal"
          class="w-full"
        />
      </UFormField>
    </section>

    <USeparator />

    <section class="flex flex-col gap-4" aria-labelledby="key-section-access">
      <h3 id="key-section-access" class="text-sm font-semibold text-highlighted">
        Access
      </h3>
      <UFormField
        name="scopes"
        label="Scopes"
        required
        description="What the key may do, within the service account's scopes."
      >
        <AppScopePicker
          v-model="state.scopes"
          :options="scopeOptions"
          :flags="scopeFlags"
          empty-text="This service account grants no scope a key may use."
        />
      </UFormField>
    </section>

    <USeparator />

    <section class="flex flex-col gap-4" aria-labelledby="key-section-limits">
      <h3 id="key-section-limits" class="text-sm font-semibold text-highlighted">
        Limits
      </h3>
      <AppApiKeyLimitsFields
        v-model:no-rate-limit="state.no_rate_limit"
        v-model:rate-limit="state.rate_limit_per_minute"
        v-model:expires="state.expires"
        v-model:ip-whitelist="state.ip_whitelist"
        id-prefix="key"
        :editing="editing"
        :expires-at="target?.expires_at ?? null"
      />
    </section>
  </AppFormDialog>
</template>
