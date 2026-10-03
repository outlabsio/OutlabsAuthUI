import type { Ref } from 'vue'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { principalGrantableScopesQuery, useCreateMachineKey, useUpdateMachineKey } from '~/queries/api-keys'
import { machineKeySchema, rateLimitWire, type MachineKeyFormState, type MachineKeySchema } from '~/schemas/api-key'
import type { ActionError } from '~/composables/useApiAction'
import type { ApiKey, CreateMachineKeyInput, IntegrationPrincipal, OneTimeSecret, UpdateApiKeyInput } from '~/types/api-key'
import { API_KEY_TYPE_HELP, API_KEY_TYPE_ITEMS, DEFAULT_EXPIRY, expiryDays } from '~/utils/api-keys'
import { oneTimeSecretFrom } from '~/utils/one-time-secret'
import { machineKeyScopeFlags, machineKeyScopeOptions, machineKeyScopeRefusal, principalScope } from '~/utils/service-accounts'

// The New key / Edit key dialog behind <AppServiceAccountKeyDialog> (F-079, F-082, F-086, F-114,
// F-115, F-116): UForm + Zod, scopes the account grants and the admin may grant (AppScopePicker,
// grouped by resource: the account's effective scopes within GET …/grantable-scopes at its
// scope, as the server checks both), a whole-number rate limit or "No rate limit", a preset
// expiry (90 days by default),
// the IP allowlist as tags validated one by one. Edit sends only what changed; an existing
// key's expiry and type are fixed. On create the one-time secret goes to the caller
// (AppSecretReveal) and the mutation is discarded at once, so nothing else keeps it (F-183).

const blank = (): MachineKeyFormState => ({
  name: '',
  description: '',
  prefix_type: 'sk_live',
  scopes: [],
  no_rate_limit: false,
  rate_limit_per_minute: 60,
  expires: DEFAULT_EXPIRY,
  ip_whitelist: []
})

function fromKey(key: ApiKey): MachineKeyFormState {
  return {
    name: key.name,
    description: key.description ?? '',
    prefix_type: key.prefix.startsWith('sk_test') ? 'sk_test' : 'sk_live',
    scopes: [...key.scopes].sort(),
    no_rate_limit: !key.rate_limit_per_minute,
    rate_limit_per_minute: key.rate_limit_per_minute || null,
    expires: DEFAULT_EXPIRY,
    ip_whitelist: [...(key.ip_whitelist ?? [])]
  }
}

// What an edit may change, as the PATCH body sends it.
function editWire(state: MachineKeyFormState) {
  return {
    name: state.name.trim(),
    description: state.description?.trim() ?? '',
    scopes: [...state.scopes].sort(),
    rate_limit_per_minute: rateLimitWire({ no_rate_limit: state.no_rate_limit, rate_limit_per_minute: state.rate_limit_per_minute ?? null }),
    ip_whitelist: [...state.ip_whitelist]
  }
}

export function useServiceAccountKeyDialog(
  account: Ref<IntegrationPrincipal>,
  target: Ref<ApiKey | null>,
  open: Ref<boolean>,
  emit: { created: (secret: OneTimeSecret) => void }
) {
  const { run } = useApiAction()
  const form = useDialogForm('keyDialog')
  const error = ref<ActionError | null>(null)
  const state = reactive<MachineKeyFormState>(blank())
  const changes = useDirtyPatch(state, editWire)
  const editing = computed(() => target.value !== null)

  // What this admin may grant at the account's scope (F-079). Read while the dialog is open (the
  // account dialog gates the same key on its own open; nothing else observes it).
  const grantable = useQuery(() => ({ ...principalGrantableScopesQuery(principalScope(account.value)), enabled: open.value }))
  const grantableApiError = useApiError(grantable.error)
  const grantableSet = computed(() => (grantable.data.value ? new Set(grantable.data.value.grantable_scopes) : null))
  const scopesState = computed<'pending' | 'error' | 'denied' | 'success'>(() => {
    if (grantable.status.value === 'error' && !grantable.data.value) return grantableApiError.value?.kind === 'forbidden' ? 'denied' : 'error'
    if (!grantableSet.value) return 'pending'
    return 'success'
  })
  const scopeOptions = computed(() => machineKeyScopeOptions(account.value.effective_allowed_scopes, grantableSet.value))
  // Scopes the key carries that the account no longer grants, or that this admin cannot grant:
  // listed and flagged, removable.
  const scopeFlags = computed<Record<string, string>>(() => machineKeyScopeFlags(state.scopes, account.value.effective_allowed_scopes, grantableSet.value))

  watch(open, (isOpen) => {
    if (!isOpen) return
    error.value = null
    Object.assign(state, target.value ? fromKey(target.value) : blank())
    changes.snapshot()
  }, { immediate: true })

  // As in the personal key dialog: a create, or an edit that changes the scopes, is re-checked
  // scope by scope, so flagged scopes are refused on the field instead of by the server. A rule
  // of the form (AppFormDialog `validate`), not an error set on submit: the field's own
  // re-validation would replace that a moment later and Save would seem to do nothing (F-082).
  // The server re-checks the scopes on create and on an edit that changes them, both against the
  // account's grant and the admin's.
  function validate(): FormError[] {
    const refusal = machineKeyScopeRefusal(scopeFlags.value)
    if (!refusal) return []
    if (editing.value && !changes.changed.value.includes('scopes')) return []
    return [{ name: 'scopes', message: refusal }]
  }

  const createKey = useCreateMachineKey()
  const updateKey = useUpdateMachineKey()
  async function onSubmit(event: FormSubmitEvent<MachineKeySchema>) {
    const data = event.data
    const scope = principalScope(account.value)
    if (target.value) {
      const keyId = target.value.id
      const patch = changes.patch.value as UpdateApiKeyInput
      const res = await run(() => updateKey.mutateAsync({ scope, principalId: account.value.id, keyId, input: patch }), {
        success: 'Key updated',
        error: 'Could not update key',
        form,
        inline: error
      })
      if (res.ok) open.value = false
      return
    }
    const days = expiryDays(data.expires)
    const input: CreateMachineKeyInput = {
      name: data.name,
      scopes: [...data.scopes],
      prefix_type: data.prefix_type,
      rate_limit_per_minute: rateLimitWire(data),
      ...(data.description ? { description: data.description } : {}),
      ...(days ? { expires_in_days: days } : {}),
      ...(data.ip_whitelist.length ? { ip_whitelist: [...data.ip_whitelist] } : {})
    }
    const res = await run(() => createKey.mutateAsync({ scope, principalId: account.value.id, input }), {
      success: 'Key created',
      error: 'Could not create key',
      form,
      inline: error
    })
    if (res.ok) {
      open.value = false
      emit.created(oneTimeSecretFrom(res.data, account.value.name))
      // The reveal dialog holds the only copy from here on (F-183).
      createKey.discard()
    }
  }

  return {
    schema: machineKeySchema,
    validate,
    state,
    error,
    editing,
    dirty: computed(() => (editing.value ? changes.dirty.value : undefined)),
    scopeOptions,
    scopeFlags,
    scopesState,
    scopesLoading: computed(() => grantable.asyncStatus.value === 'loading'),
    scopesError: grantable.error,
    retryScopes: () => void grantable.refetch(),
    keyTypeItems: API_KEY_TYPE_ITEMS,
    keyTypeHelp: API_KEY_TYPE_HELP,
    // Short titles and descriptions: at phone width the close button sits over the header's end.
    title: computed(() => (target.value ? 'Edit key' : 'New key')),
    submitLabel: computed(() => (target.value ? 'Save changes' : 'Create key')),
    description: computed(() => target.value?.name ?? 'Acts as this service account.'),
    note: computed(() => (target.value
      ? `A key of ${account.value.name}. Changes apply to the next request signed with it; its secret stays the same.`
      // The header already says the key acts as this service account.
      : 'Its secret is shown once.')),
    onSubmit
  }
}
