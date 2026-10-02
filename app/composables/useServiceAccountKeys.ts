import type { Ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { principalKeysQuery, useRevokeMachineKey, useRotateMachineKey, useUpdateMachineKey } from '~/queries/api-keys'
import type { ApiKey, CreateApiKeyResponse, IntegrationPrincipal, OneTimeSecret } from '~/types/api-key'
import { oneTimeSecretFrom } from '~/utils/one-time-secret'
import { slicePage } from '~/utils/pagination'
import { apiKeyActionStates, apiKeyMenuItems, keyListEmptyCopy, visibleKeys, type ApiKeyAction } from '~/utils/api-keys'
import { principalScope, serviceAccountPolicy } from '~/utils/service-accounts'

// The Keys tab of a service account (<AppServiceAccountKeysCard>): its keys, live ones by default
// with "Include revoked and expired" (F-184; a key past its expiry date counts as expired), true
// counts and pages; New key (only on an active account, api_key:create); per key (apiKeyActionStates)
// View details (AppApiKeyDetail), Edit (F-082), Rotate (only an active key in effect, else shown
// disabled with the reason, F-080), Suspend or Reactivate (api_key:update) and Revoke
// (api_key:delete), each confirmed. Create and rotate reveal the one-time secret in
// AppSecretReveal, named after the account: the mutations are discarded right after (F-183).

const PAGE_SIZE = 25

export function useServiceAccountKeys(account: Ref<IntegrationPrincipal>) {
  const { canRead, canCreate, canUpdate, canDelete } = useServiceAccountGrants()
  const scope = computed(() => principalScope(account.value))
  const policy = computed(() => serviceAccountPolicy(account.value, { canCreate: canCreate.value, canUpdate: canUpdate.value, canDelete: canDelete.value }))

  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...principalKeysQuery({ scope: scope.value, principalId: account.value.id }),
    enabled: canRead.value
  }))
  const includeTerminal = ref(false)
  const page = ref(1)
  const now = useRelativeNow()
  const shown = computed(() => visibleKeys(data.value?.items ?? [], includeTerminal.value, now.value.getTime()))
  const total = computed(() => shown.value.length)
  const keys = computed<ApiKey[]>(() => slicePage(shown.value, page.value, PAGE_SIZE))
  const hiddenTerminal = computed(() => (data.value?.items.length ?? 0) - visibleKeys(data.value?.items ?? [], false, now.value.getTime()).length)
  const incomplete = computed(() => data.value?.complete === false)
  const empty = computed(() => keyListEmptyCopy({ hiddenTerminal: hiddenTerminal.value, noneYet: 'Create a key to let an integration act as this service account.' }))
  watch(includeTerminal, () => {
    page.value = 1
  })
  watch(total, (count) => {
    const last = Math.max(1, Math.ceil(count / PAGE_SIZE))
    if (page.value > last) page.value = last
  })

  // --- One-time secret (create + rotate) ---
  const revealed = ref<OneTimeSecret | null>(null)
  function onCreated(secret: OneTimeSecret) {
    revealed.value = secret
  }

  // --- Rotate / suspend / reactivate / revoke ---
  type KeyTarget = { key: ApiKey }
  const rotateMutation = useRotateMachineKey()
  const rotate = useConfirmAction<KeyTarget, CreateApiKeyResponse>({
    describe: ({ key }) => ({
      title: `Rotate key ${key.name}`,
      effects: apiKeyRotateEffects(key),
      confirmLabel: 'Rotate key',
      confirmColor: 'warning'
    }),
    action: ({ key }) => rotateMutation.mutateAsync({ scope: scope.value, principalId: account.value.id, keyId: key.id }),
    success: 'Key rotated',
    error: 'Could not rotate key',
    onSuccess: (created) => {
      revealed.value = oneTimeSecretFrom(created, account.value.name)
      // The reveal dialog holds the only copy from here on (F-183).
      rotateMutation.discard()
    }
  })

  const revokeMutation = useRevokeMachineKey()
  const revoke = useConfirmAction<KeyTarget>({
    describe: ({ key }) => ({
      title: `Revoke key ${key.name}`,
      effects: API_KEY_REVOKE_EFFECTS,
      confirmLabel: 'Revoke key'
    }),
    action: ({ key }) => revokeMutation.mutateAsync({ scope: scope.value, principalId: account.value.id, keyId: key.id }),
    success: 'Key revoked',
    error: 'Could not revoke key'
  })

  const updateMutation = useUpdateMachineKey()
  const changeStatus = useConfirmAction<KeyTarget & { action: 'suspend' | 'reactivate' }>({
    describe: ({ key, action }) => apiKeyStatusCopy(key.name, action, 'key'),
    action: ({ key, action }) => updateMutation.mutateAsync({ scope: scope.value, principalId: account.value.id, keyId: key.id, input: { status: action === 'suspend' ? 'suspended' : 'active' } }),
    success: ({ action }) => `Key ${action === 'suspend' ? 'suspended' : 'reactivated'}`,
    error: ({ action }) => `Could not ${action} key`
  })

  // --- Edit (the New key dialog, prefilled) ---
  const editTarget = ref<ApiKey | null>(null)
  const dialogOpen = ref(false)
  function openCreate() {
    editTarget.value = null
    dialogOpen.value = true
  }
  function openEdit(key: ApiKey) {
    editTarget.value = key
    dialogOpen.value = true
  }

  // --- Detail (AppApiKeyDetail) ---
  const detailId = ref<string | null>(null)
  const detailOpen = ref(false)
  const detailKey = computed(() => (detailId.value ? (data.value?.items ?? []).find(key => key.id === detailId.value) ?? null : null))
  function openDetail(key: ApiKey) {
    detailId.value = key.id
    detailOpen.value = true
  }

  function actionStates(key: ApiKey) {
    if (account.value.status === 'archived') return []
    return apiKeyActionStates(key, { canUpdate: canUpdate.value, canDelete: canDelete.value }, now.value.getTime())
  }
  function runAction(key: ApiKey, action: ApiKeyAction) {
    switch (action) {
      case 'edit': return openEdit(key)
      case 'rotate': return rotate.ask({ key })
      case 'suspend': return changeStatus.ask({ key, action: 'suspend' })
      case 'reactivate': return changeStatus.ask({ key, action: 'reactivate' })
      case 'revoke': return revoke.ask({ key })
    }
  }
  /** From the detail's footer: the detail closes so the dialog it opens has the focus. */
  function onDetailAction(action: ApiKeyAction) {
    const key = detailKey.value
    if (!key) return
    detailOpen.value = false
    runAction(key, action)
  }

  /** A key's menu; empty for revoked keys and on an archived account (hide the menu). */
  function rowMenu(key: ApiKey): DropdownMenuItem[] {
    const handlers = {
      view: () => openDetail(key),
      edit: () => runAction(key, 'edit'),
      rotate: () => runAction(key, 'rotate'),
      suspend: () => runAction(key, 'suspend'),
      reactivate: () => runAction(key, 'reactivate'),
      revoke: () => runAction(key, 'revoke')
    }
    return apiKeyMenuItems(actionStates(key), handlers)
  }

  // A key acts with at most the account's effective scopes; without any, a key could do nothing.
  const noScopes = computed(() => !account.value.effective_allowed_scopes.length)

  return {
    canCreateKey: computed(() => policy.value.canCreateKey),
    noScopes,
    keys,
    total,
    page,
    pageSize: PAGE_SIZE,
    status,
    error,
    isLoading,
    hasData: computed(() => data.value !== undefined),
    refetch,
    includeTerminal,
    hiddenTerminal,
    empty,
    incomplete,
    rowMenu,
    revealed,
    dialogOpen,
    editTarget,
    openCreate,
    onCreated,
    detailOpen,
    detailKey,
    detailActions: computed(() => (detailKey.value ? actionStates(detailKey.value) : [])),
    openDetail,
    onDetailAction,
    rotate,
    revoke,
    changeStatus
  }
}
