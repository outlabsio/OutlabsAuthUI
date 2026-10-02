import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { myMembershipsQuery } from '~/queries/account'
import { grantableScopesQuery, useCreateApiKey, useUpdateApiKey } from '~/queries/api-keys'
import { personalKeySchema, rateLimitWire, type PersonalKeyFormState, type PersonalKeySchema } from '~/schemas/api-key'
import type { ActionError } from '~/composables/useApiAction'
import type { ApiKey, ApiKeyGrantableScopes, CreateApiKeyInput, OneTimeSecret, UpdateApiKeyInput } from '~/types/api-key'
import { API_KEY_TYPE_HELP, API_KEY_TYPE_ITEMS, DEFAULT_EXPIRY, expiryDays, replacementExpiry } from '~/utils/api-keys'
import { entityPathLabel } from '~/utils/entity-tree'
import { oneTimeSecretFrom } from '~/utils/one-time-secret'

// The personal API key dialog behind <AppApiKeyFormDialog>: create, edit and "create replacement"
// (F-080, F-082, F-083, F-086, F-087, F-114, F-116). UForm + Zod (personalKeySchema).
// - Access: on EnterpriseRBAC a key can be restricted to one entity where the signed-in account
//   holds a membership in force (and optionally the entities beneath it). The scope picker offers
//   what the server says this account may grant there (GET /api-keys/grantable-scopes, refetched
//   when the restriction changes), grouped by resource, with loading, error and empty states.
//   Selected scopes the server no longer offers are flagged: a create, or an edit that changes
//   scopes or the restriction, must drop them (the server re-checks every scope then).
// - Limits: a whole-number rate limit or "No rate limit", an expiry preset (fixed once created),
//   the IP allowlist as validated tags. Key type is a label only (F-087).
// - Edit sends only the changed fields (useDirtyPatch). A replacement is a new key with the old
//   key's settings and a fresh expiry; the old key stays as it is.
// Create and replacement reveal the one-time secret through the caller (AppSecretReveal) and the
// mutation is discarded at once (F-183).

export type ApiKeyFormTarget = { mode: 'create' } | { mode: 'edit', key: ApiKey } | { mode: 'replace', key: ApiKey }

export type AnchorOption = { label: string, value: string, description?: string }

const blank = (): PersonalKeyFormState => ({
  name: '',
  description: '',
  prefix_type: 'sk_live',
  scopes: [],
  no_rate_limit: false,
  rate_limit_per_minute: 60,
  expires: DEFAULT_EXPIRY,
  ip_whitelist: [],
  entity_id: '',
  inherit_from_tree: false
})

function fromKey(key: ApiKey, mode: 'edit' | 'replace'): PersonalKeyFormState {
  return {
    name: key.name,
    description: key.description ?? '',
    prefix_type: key.prefix.startsWith('sk_test') ? 'sk_test' : 'sk_live',
    scopes: [...key.scopes].sort(),
    no_rate_limit: !key.rate_limit_per_minute,
    rate_limit_per_minute: key.rate_limit_per_minute || null,
    expires: mode === 'replace' ? replacementExpiry(key) : DEFAULT_EXPIRY,
    ip_whitelist: [...(key.ip_whitelist ?? [])],
    entity_id: key.entity_ids?.[0] ?? '',
    inherit_from_tree: Boolean(key.entity_ids?.length) && key.inherit_from_tree
  }
}

export function useApiKeyFormDialog(
  target: MaybeRefOrGetter<ApiKeyFormTarget | null>,
  open: Ref<boolean>,
  emit: { created: (secret: OneTimeSecret) => void }
) {
  const { run } = useApiAction()
  const { user, isEnterprise, hasMemberships, canAccess } = useAuth()
  const form = useDialogForm('apiKeyDialog')
  const error = ref<ActionError | null>(null)
  const state = reactive<PersonalKeyFormState>(blank())
  const mode = computed(() => toValue(target)?.mode ?? 'create')
  const editedKey = computed(() => {
    const t = toValue(target)
    return t && t.mode !== 'create' ? t.key : null
  })

  // --- Restriction to an entity (EnterpriseRBAC) ---
  const anchorsShown = computed(() => isEnterprise.value && hasMemberships.value)
  const memberships = useQuery(() => ({ ...myMembershipsQuery, enabled: open.value && anchorsShown.value }))
  const membershipEntityIds = computed(() => [...new Set((memberships.data.value ?? []).filter(m => m.is_currently_valid).map(m => m.entity_id))])
  const anchorIds = computed(() => {
    const current = editedKey.value?.entity_ids?.[0]
    return current && !membershipEntityIds.value.includes(current) ? [...membershipEntityIds.value, current] : membershipEntityIds.value
  })
  const { knownById } = useMembershipEntities(anchorIds, () => open.value && anchorsShown.value && canAccess('entities'))
  function anchorLabel(id: string): AnchorOption {
    const entity = knownById.value.get(id)
    if (entity) {
      const path = entityPathLabel(id, knownById.value)
      return { value: id, label: entity.display_name || entity.name, description: path !== (entity.display_name || entity.name) ? path : undefined }
    }
    if (id === user.value?.root_entity_id && user.value?.root_entity_name) return { value: id, label: user.value.root_entity_name }
    return { value: id, label: 'An entity you belong to', description: `Its name is not visible to your account (${id.slice(0, 8)}…).` }
  }
  // The select's own value for "no entity": combobox items cannot carry an empty value.
  const NO_ANCHOR = 'none'
  const anchorChoice = computed({
    get: () => state.entity_id || NO_ANCHOR,
    set: (value: string) => {
      state.entity_id = value === NO_ANCHOR ? '' : value
    }
  })
  const anchorItems = computed<AnchorOption[]>(() => [
    { value: NO_ANCHOR, label: 'Not restricted', description: 'Acts wherever your access applies.' },
    ...anchorIds.value.map(anchorLabel).sort((a, b) => a.label.localeCompare(b.label))
  ])
  const anchorName = computed(() => (state.entity_id ? anchorLabel(state.entity_id).label : null))
  watch(() => state.entity_id, (id) => {
    if (!id) state.inherit_from_tree = false
  })

  // --- Scopes: what the server lets this account grant, for the chosen restriction ---
  const grantable = useQuery(() => ({
    ...grantableScopesQuery({ entityId: anchorsShown.value ? state.entity_id || null : null, inheritFromTree: state.inherit_from_tree }),
    // Switching the restriction keeps the previous options on screen while the new ones load.
    placeholderData: keepPreviousData<ApiKeyGrantableScopes>,
    enabled: open.value
  }))
  const scopeOptions = computed(() => [...(grantable.data.value?.grantable_scopes ?? [])].sort())
  const scopeFlags = computed<Record<string, string>>(() => {
    if (grantable.status.value !== 'success' || grantable.asyncStatus.value === 'loading') return {}
    const offered = new Set(scopeOptions.value)
    return Object.fromEntries(state.scopes.filter(name => !offered.has(name)).map(name => [name, 'not grantable here']))
  })
  const allowedActions = computed(() => grantable.data.value?.personal_allowed_action_prefixes ?? [])
  const scopesHelp = computed(() => {
    const actions = allowedActions.value
    const kinds = actions.length ? ` whose action is ${actions.length > 1 ? `${actions.slice(0, -1).join(', ')} or ${actions.at(-1)}` : actions[0]}` : ''
    return `The key can carry only permissions you hold${kinds}, and never key management.`
  })
  const scopesEmptyText = computed(() => (state.entity_id
    ? 'You hold no permission a personal key may carry at this entity.'
    : 'You hold no permission a personal key may carry.'))

  // --- Fill on open ---
  function editWire(s: PersonalKeyFormState) {
    return {
      name: s.name.trim(),
      description: s.description?.trim() ?? '',
      scopes: [...s.scopes].sort(),
      rate_limit_per_minute: rateLimitWire({ no_rate_limit: s.no_rate_limit, rate_limit_per_minute: s.rate_limit_per_minute ?? null }),
      ip_whitelist: [...s.ip_whitelist],
      ...(anchorsShown.value ? { entity_ids: s.entity_id ? [s.entity_id] : [], inherit_from_tree: Boolean(s.entity_id) && s.inherit_from_tree } : {})
    }
  }
  const changes = useDirtyPatch(state, editWire)
  watch(open, (isOpen) => {
    if (!isOpen) return
    error.value = null
    const t = toValue(target)
    Object.assign(state, t && t.mode !== 'create' ? fromKey(t.key, t.mode) : blank())
    changes.snapshot()
  }, { immediate: true })

  // A create, or an edit that touches the grant, is re-checked scope by scope: flagged scopes
  // would be refused, so the dialog says so on the field instead of sending it. A rule of the
  // form (AppFormDialog `validate`), not an error set on submit: the field's own re-validation
  // would replace that a moment later and the submit would seem to do nothing (F-082).
  const GRANT_FIELDS = ['scopes', 'entity_ids', 'inherit_from_tree']
  function validate(): FormError[] {
    const flagged = Object.keys(scopeFlags.value)
    if (!flagged.length) return []
    if (mode.value === 'edit' && !changes.changed.value.some(field => GRANT_FIELDS.includes(field))) return []
    return [{ name: 'scopes', message: `Remove ${flagged.join(', ')}: ${flagged.length === 1 ? 'it is' : 'they are'} not grantable${state.entity_id ? ' at this entity' : ''}.` }]
  }

  const createKey = useCreateApiKey()
  const updateKey = useUpdateApiKey()
  async function onSubmit(event: FormSubmitEvent<PersonalKeySchema>) {
    const key = editedKey.value
    if (mode.value === 'edit' && key) {
      const patch = changes.patch.value as UpdateApiKeyInput
      const res = await run(() => updateKey.mutateAsync({ keyId: key.id, input: patch }), {
        success: 'API key updated',
        error: 'Could not update API key',
        form,
        inline: error,
        fieldMap: { entity_ids: 'entity_id' }
      })
      if (res.ok) open.value = false
      return
    }
    const data = event.data
    const days = expiryDays(data.expires)
    const input: CreateApiKeyInput = {
      name: data.name,
      scopes: [...data.scopes],
      key_kind: 'personal',
      prefix_type: data.prefix_type,
      rate_limit_per_minute: rateLimitWire(data),
      ...(data.description ? { description: data.description } : {}),
      ...(days ? { expires_in_days: days } : {}),
      ...(data.ip_whitelist.length ? { ip_whitelist: [...data.ip_whitelist] } : {}),
      ...(anchorsShown.value && data.entity_id ? { entity_ids: [data.entity_id], inherit_from_tree: data.inherit_from_tree } : {})
    }
    const res = await run(() => createKey.mutateAsync(input), {
      success: 'API key created',
      error: 'Could not create API key',
      form,
      inline: error,
      fieldMap: { entity_ids: 'entity_id' }
    })
    if (res.ok) {
      open.value = false
      emit.created(oneTimeSecretFrom(res.data, user.value?.email ?? null))
      // The reveal dialog holds the only copy from here on (F-183).
      createKey.discard()
    }
  }

  // Titles stay short and descriptions start short: at phone width the dialog's close button
  // sits over the end of the header's first lines.
  const title = computed(() => {
    if (mode.value === 'edit') return 'Edit API key'
    if (mode.value === 'replace') return 'Create replacement key'
    return 'Create personal API key'
  })
  const description = computed(() => editedKey.value?.name ?? 'Acts as you, within the scopes you choose.')
  const note = computed(() => {
    if (mode.value === 'edit') return 'Changes apply to the next request signed with this key; its secret stays the same.'
    if (mode.value === 'replace') return 'A new key with the expired key\'s settings and a new expiry. The secret is shown once; the expired key stays listed as expired.'
    // The header already says the key acts as you within the chosen scopes.
    return 'Its secret is shown once.'
  })

  return {
    schema: personalKeySchema,
    validate,
    state,
    error,
    mode,
    editedKey,
    dirty: computed(() => (mode.value === 'edit' ? changes.dirty.value : undefined)),
    title,
    description,
    note,
    submitLabel: computed(() => (mode.value === 'edit' ? 'Save changes' : 'Create key')),
    keyTypeItems: API_KEY_TYPE_ITEMS,
    keyTypeHelp: API_KEY_TYPE_HELP,
    anchorsShown,
    anchorChoice,
    anchorItems,
    anchorName,
    anchorsLoading: computed(() => memberships.status.value === 'pending'),
    scopeOptions,
    scopeFlags,
    scopesStatus: grantable.status,
    scopesError: grantable.error,
    scopesLoading: computed(() => grantable.asyncStatus.value === 'loading'),
    retryScopes: () => void grantable.refetch(),
    scopesHelp,
    scopesEmptyText,
    onSubmit
  }
}
