import type { Ref } from 'vue'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { useCreateMachineKey, useUpdateMachineKey } from '~/queries/api-keys'
import { machineKeySchema, rateLimitWire, type MachineKeyFormState, type MachineKeySchema } from '~/schemas/api-key'
import type { ActionError } from '~/composables/useApiAction'
import type { ApiKey, CreateMachineKeyInput, IntegrationPrincipal, OneTimeSecret, UpdateApiKeyInput } from '~/types/api-key'
import { API_KEY_TYPE_HELP, API_KEY_TYPE_ITEMS, DEFAULT_EXPIRY, expiryDays } from '~/utils/api-keys'
import { oneTimeSecretFrom } from '~/utils/one-time-secret'
import { principalScope } from '~/utils/service-accounts'

// The New key / Edit key dialog behind <AppServiceAccountKeyDialog> (F-082, F-086, F-114, F-115,
// F-116): UForm + Zod, scopes within the account's effective scopes (AppScopePicker, grouped by
// resource), a whole-number rate limit or "No rate limit", a preset expiry (90 days by default),
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

  const scopeOptions = computed(() => [...account.value.effective_allowed_scopes].sort())
  // Scopes the key carries that the account no longer grants: listed and flagged, removable.
  const scopeFlags = computed<Record<string, string>>(() => {
    const offered = new Set(scopeOptions.value)
    return Object.fromEntries(state.scopes.filter(name => !offered.has(name)).map(name => [name, 'not granted to the account']))
  })

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
  function validate(): FormError[] {
    const flagged = Object.keys(scopeFlags.value)
    if (!flagged.length) return []
    if (editing.value && !changes.changed.value.includes('scopes')) return []
    return [{ name: 'scopes', message: `Remove ${flagged.join(', ')}: ${flagged.length === 1 ? 'it is' : 'they are'} not granted to the account.` }]
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
