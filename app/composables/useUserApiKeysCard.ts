import type { Ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { useRevokeUserApiKey, userApiKeysQuery } from '~/queries/users'
import type { ApiKey } from '~/types/api-key'
import type { User } from '~/types/user'
import { apiKeyActionStates, apiKeyMenuItems, keyListEmptyCopy, visibleKeys } from '~/utils/api-keys'
import { slicePage } from '~/utils/pagination'

// The Security tab's Personal API keys card (AppUserApiKeysCard), shown only where the server
// advertises API keys. Metadata only: secrets are never fetched. Live keys by default with
// "Include revoked and expired" (F-184); each key's name opens its detail (AppApiKeyDetail,
// F-028) and its status says whether it works (AppApiKeyStatus, F-027). An admin with
// user:update can revoke a live key (DELETE /users/{id}/api-keys/{key}; superuser accounts need a
// global admin). Pages of 10 with the true total, like the other key tables.
const PAGE_SIZE = 10

export function useUserApiKeysCard(user: Ref<User>) {
  const { canAccess } = useAuth()
  const userId = computed(() => user.value.id)
  const canRead = computed(() => canAccess('users'))
  const { canEdit } = useUserPolicy(user)
  const now = useRelativeNow()

  const { data, status, error, isLoading, refetch } = useQuery(() => ({ ...userApiKeysQuery(userId.value), enabled: canRead.value }))
  // Newest first, as on My API keys: the backend returns a user's keys in no particular order.
  const all = computed<ApiKey[]>(() => [...(data.value ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)))
  const includeTerminal = ref(false)
  const shown = computed<ApiKey[]>(() => visibleKeys(all.value, includeTerminal.value, now.value.getTime()))
  const hiddenTerminal = computed(() => all.value.length - visibleKeys(all.value, false, now.value.getTime()).length)
  const page = ref(1)
  const keys = computed<ApiKey[]>(() => slicePage(shown.value, page.value, PAGE_SIZE))
  watch(includeTerminal, () => {
    page.value = 1
  })
  watch(() => shown.value.length, (count) => {
    const last = Math.max(1, Math.ceil(count / PAGE_SIZE))
    if (page.value > last) page.value = last
  })
  const empty = computed(() => keyListEmptyCopy({ hiddenTerminal: hiddenTerminal.value, noneYet: 'This user has not created any personal API keys.' }))
  const hasData = computed(() => data.value !== undefined)

  const revokeKey = useRevokeUserApiKey()
  const revoke = useConfirmAction<ApiKey>({
    describe: key => ({
      title: `Revoke API key ${key.name}`,
      description: `A personal key of ${user.value.email}.`,
      effects: [
        'Requests signed with this key are refused immediately.',
        'The key stays listed as revoked for the audit trail. It can\'t be reactivated or rotated.',
        'The owner can create a new key if they still need API access.'
      ],
      confirmLabel: 'Revoke key'
    }),
    action: key => revokeKey.mutateAsync({ userId: userId.value, keyId: key.id }),
    success: 'API key revoked',
    error: 'Could not revoke API key'
  })

  // --- Detail ---
  const detailId = ref<string | null>(null)
  const detailOpen = ref(false)
  const detailKey = computed(() => all.value.find(key => key.id === detailId.value) ?? null)
  function openDetail(key: ApiKey) {
    detailId.value = key.id
    detailOpen.value = true
  }

  const actionStates = (key: ApiKey) => apiKeyActionStates(key, { canUpdate: false, canDelete: canEdit.value }, now.value.getTime())
  function rowMenu(key: ApiKey): DropdownMenuItem[] {
    return apiKeyMenuItems(actionStates(key), { view: () => openDetail(key), revoke: () => revoke.ask(key) })
  }
  function onDetailAction() {
    const key = detailKey.value
    detailOpen.value = false
    if (key) revoke.ask(key)
  }

  return {
    keys,
    total: computed(() => shown.value.length),
    page,
    pageSize: PAGE_SIZE,
    empty,
    includeTerminal,
    hiddenTerminal,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    rowMenu,
    revoke,
    detailOpen,
    detailKey,
    detailActions: computed(() => (detailKey.value ? actionStates(detailKey.value) : [])),
    openDetail,
    onDetailAction
  }
}
