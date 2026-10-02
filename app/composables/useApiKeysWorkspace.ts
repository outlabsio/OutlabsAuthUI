import type { ButtonProps, DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { apiKeyDetailQuery, myApiKeysQuery, useRevokeApiKey, useRotateApiKey, useUpdateApiKey } from '~/queries/api-keys'
import type { ApiKeyFormTarget } from '~/composables/useApiKeyFormDialog'
import type { ApiKey, OneTimeSecret } from '~/types/api-key'
import { apiKeyActionStates, apiKeyMenuItems, apiKeyState, type ApiKeyAction, type ApiKeyStateKind } from '~/utils/api-keys'
import { oneTimeSecretFrom } from '~/utils/one-time-secret'
import { slicePage } from '~/utils/pagination'

// Personal API keys ("My API keys"): the signed-in account's own keys. No permission gate: every
// actor manages their own keys, but the 'api-keys' section still needs the api_keys router (fail
// closed without /auth/config). The SFC binds this and owns display config (columns).
// - List (F-028, F-060, F-125, F-127, F-184): GET /api-keys/ returns every key at once, so search
//   (name, prefix, description), the status filter and pages are client-side, kept in the route
//   query (q, status, page) through useListQueryState. Active and suspended keys by default.
//   Status is the key's effective state (AppApiKeyStatus, F-027): a key past its expiry date is
//   Expired even though the server keeps it 'active'.
// - Detail (F-028): a key's name opens AppApiKeyDetail, re-read from GET /api-keys/{id}.
// - Actions (apiKeyActionStates): Edit (F-082), Rotate only on an active key in effect (F-080;
//   disabled with the reason otherwise), Suspend / Reactivate, Revoke, and "Create replacement"
//   for an expired key (a new key with its settings and a fresh expiry).
// - Create, edit and replace share <AppApiKeyFormDialog>; create, replace and rotate reveal the
//   one-time secret in AppSecretReveal and discard their mutation at once (F-183).

export type PersonalKeyFilter = 'live' | 'active' | 'suspended' | 'expired' | 'revoked' | 'all'
const FILTERS = ['live', 'active', 'suspended', 'expired', 'revoked', 'all'] as const satisfies readonly PersonalKeyFilter[]
const FILTER_KINDS: Record<PersonalKeyFilter, readonly ApiKeyStateKind[] | null> = {
  live: ['active', 'ineffective', 'suspended'],
  active: ['active', 'ineffective'],
  suspended: ['suspended'],
  expired: ['expired'],
  revoked: ['revoked'],
  all: null
}

export function useApiKeysWorkspace() {
  const { canAccess, user } = useAuth()
  const canRead = computed(() => canAccess('api-keys'))
  const now = useRelativeNow()

  // --- List ---
  const list = useListQueryState({
    filters: { status: 'live' as PersonalKeyFilter },
    allowed: { status: FILTERS },
    pageSize: 25
  })
  const { search, searchTerm, page, pageSize, filters: { status: statusFilter }, isFiltered } = list
  const { data, status, error, isLoading, refetch } = useQuery(() => ({ ...myApiKeysQuery, enabled: canRead.value }))
  const all = computed<ApiKey[]>(() => data.value ?? [])
  const matching = computed<ApiKey[]>(() => {
    const kinds = FILTER_KINDS[statusFilter.value]
    const term = searchTerm.value.toLowerCase()
    const at = now.value.getTime()
    return all.value
      .filter(key => !kinds || kinds.includes(apiKeyState(key, at).kind))
      .filter(key => !term || [key.name, key.prefix, key.description ?? ''].some(text => text.toLowerCase().includes(term)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  })
  const total = computed(() => matching.value.length)
  const rows = computed(() => slicePage(matching.value, page.value, pageSize.value))
  list.syncTotal(() => (data.value ? total.value : undefined))

  const statusItems: { label: string, value: PersonalKeyFilter }[] = [
    { label: 'Active and suspended', value: 'live' },
    { label: 'Active', value: 'active' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Expired', value: 'expired' },
    { label: 'Revoked', value: 'revoked' },
    { label: 'All keys', value: 'all' }
  ]
  function showAll() {
    list.reset()
    statusFilter.value = 'all'
  }
  const emptyState = computed(() => {
    if (!all.value.length) {
      return {
        title: 'No API keys yet',
        description: 'Create a key to call the API as yourself from a script or an integration.',
        actions: [{ label: 'Create a key', icon: 'i-lucide-plus', onClick: () => openCreate() }] satisfies ButtonProps[]
      }
    }
    return {
      title: 'No keys match',
      description: isFiltered.value ? 'Try a different search, or show every key.' : 'No key matches.',
      actions: [{ label: 'Show all keys', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: showAll }] satisfies ButtonProps[]
    }
  })

  // --- One-time secret reveal (create, replace and rotate) ---
  // Setting it opens AppSecretReveal; the component clears it once the dialog has closed. The
  // mutations are discarded right after, so this is the only copy.
  const revealedSecret = ref<OneTimeSecret | null>(null)
  // A personal key acts as the signed-in user: name them as its owner.
  const owner = computed(() => user.value?.email ?? null)

  // --- Create / edit / replace (AppApiKeyFormDialog) ---
  const formOpen = ref(false)
  const formTarget = ref<ApiKeyFormTarget | null>(null)
  function openCreate() {
    formTarget.value = { mode: 'create' }
    formOpen.value = true
  }
  function onCreated(secret: OneTimeSecret) {
    revealedSecret.value = secret
  }

  // --- Rotate (POST /api-keys/{id}/rotate: a new key with the same settings, the old one revoked) ---
  const rotateApiKey = useRotateApiKey()
  const rotateKey = useConfirmAction({
    describe: (key: ApiKey) => ({
      title: `Rotate API key ${key.name}`,
      effects: apiKeyRotateEffects(key),
      confirmLabel: 'Rotate key',
      confirmColor: 'warning'
    }),
    action: (key: ApiKey) => rotateApiKey.mutateAsync(key.id),
    success: 'API key rotated',
    error: 'Could not rotate API key',
    onSuccess: (created) => {
      revealedSecret.value = oneTimeSecretFrom(created, owner.value)
      // The reveal dialog holds the only copy from here on (F-183).
      rotateApiKey.discard()
    }
  })

  // --- Revoke (DELETE /api-keys/{id}: kept as revoked, never usable again) ---
  const revokeApiKey = useRevokeApiKey()
  const revokeKey = useConfirmAction<ApiKey>({
    describe: key => ({
      title: `Revoke API key ${key.name}`,
      effects: API_KEY_REVOKE_EFFECTS,
      confirmLabel: 'Revoke key'
    }),
    action: key => revokeApiKey.mutateAsync(key.id),
    success: 'API key revoked',
    error: 'Could not revoke API key'
  })

  // --- Suspend / reactivate (status active↔suspended) ---
  const updateApiKey = useUpdateApiKey()
  const changeKeyStatus = useConfirmAction<{ key: ApiKey, action: 'suspend' | 'reactivate' }>({
    describe: ({ key, action }) => apiKeyStatusCopy(key.name, action, 'API key'),
    action: ({ key, action }) => updateApiKey.mutateAsync({ keyId: key.id, input: { status: action === 'suspend' ? 'suspended' : 'active' } }),
    success: ({ action }) => `API key ${action === 'suspend' ? 'suspended' : 'reactivated'}`,
    error: ({ action }) => `Could not ${action} API key`
  })

  // --- Actions ---
  const actionStates = (key: ApiKey) => apiKeyActionStates(key, { canUpdate: true, canDelete: true, canReplace: true }, now.value.getTime())
  function runAction(key: ApiKey, action: ApiKeyAction) {
    switch (action) {
      case 'edit':
      case 'replace':
        formTarget.value = { mode: action, key }
        formOpen.value = true
        return
      case 'rotate': return rotateKey.ask(key)
      case 'suspend': return changeKeyStatus.ask({ key, action: 'suspend' })
      case 'reactivate': return changeKeyStatus.ask({ key, action: 'reactivate' })
      case 'revoke': return revokeKey.ask(key)
    }
  }

  // --- Detail (AppApiKeyDetail, re-read while open) ---
  const detailId = ref<string | null>(null)
  const detailOpen = ref(false)
  const listedDetail = computed(() => all.value.find(key => key.id === detailId.value) ?? null)
  const detailQuery = useQuery(() => ({
    ...apiKeyDetailQuery(detailId.value ?? ''),
    placeholderData: () => listedDetail.value ?? undefined,
    enabled: detailOpen.value && Boolean(detailId.value)
  }))
  const detailKey = computed(() => detailQuery.data.value ?? listedDetail.value)
  const detailError = useApiErrorMessage(detailQuery.error)
  function openDetail(key: ApiKey) {
    detailId.value = key.id
    detailOpen.value = true
  }
  /** From the detail's footer: it closes so the dialog it opens takes the focus. */
  function onDetailAction(action: ApiKeyAction) {
    const key = detailKey.value
    detailOpen.value = false
    if (key) runAction(key, action)
  }

  function rowMenu(key: ApiKey): DropdownMenuItem[] {
    return apiKeyMenuItems(actionStates(key), {
      view: () => openDetail(key),
      edit: () => runAction(key, 'edit'),
      rotate: () => runAction(key, 'rotate'),
      suspend: () => runAction(key, 'suspend'),
      reactivate: () => runAction(key, 'reactivate'),
      revoke: () => runAction(key, 'revoke'),
      replace: () => runAction(key, 'replace')
    })
  }

  return {
    canRead,
    search,
    statusFilter,
    statusItems,
    rows,
    total,
    page,
    pageSize,
    status,
    error,
    isLoading,
    hasData: computed(() => data.value !== undefined),
    refetch,
    emptyState,
    rowMenu,
    openDetail,
    detailOpen,
    detailKey,
    detailActions: computed(() => (detailKey.value ? actionStates(detailKey.value) : [])),
    detailRefreshing: computed(() => detailQuery.asyncStatus.value === 'loading'),
    detailError: computed(() => (detailQuery.status.value === 'error' ? detailError.value : null)),
    onDetailAction,
    owner,
    revealedSecret,
    formOpen,
    formTarget,
    openCreate,
    onCreated,
    rotateKey,
    revokeKey,
    changeKeyStatus
  }
}
