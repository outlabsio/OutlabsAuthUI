import type { MaybeRefOrGetter } from 'vue'
import { refDebounced } from '@vueuse/core'
import { useQuery } from '@pinia/colada'
import { usersListQuery } from '~/queries/users'
import { keepPreviousData } from '~/composables/useListQueryState'
import { useUiStore } from '~/stores/ui'
import type { User, UsersListResponse } from '~/types/user'
import { isUuid } from '~/utils/users'

// Data for AppUserPicker: the accounts the admin can read (GET /users/, which outlabs-auth scopes
// to a delegated admin's organization), searched on the server by name or email as they type.
// Nothing loads until the signed-in account opens a picker for the first time in this tab; from
// then on, a page with pickers loads the list when it mounts (the UI store keeps that latch per
// account, so after a sign-out or with another account the pickers wait for an open again).
// The chosen account keeps its option while other results come and go, and an id that arrives
// from elsewhere (a link) is named through useUserLabel ("You", its email, or "Another account").

export type UserPickerOption = { label: string, value: string, description?: string }

const PICKER_LIMIT = 25

function optionFor(user: Pick<User, 'id' | 'email' | 'first_name' | 'last_name' | 'status'>): UserPickerOption {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return {
    label: name || user.email,
    value: user.id,
    description: [name ? user.email : '', user.status !== 'active' ? statusLabel(user.status) : ''].filter(Boolean).join(' · ') || undefined
  }
}

export function useUserPicker(options: { selectedId: MaybeRefOrGetter<string | undefined>, enabled: MaybeRefOrGetter<boolean> }) {
  const { canAccess, user } = useAuth()
  const canRead = computed(() => canAccess('users') && toValue(options.enabled))
  // Every picker on a page observes the same unsearched list key, so they all carry the same
  // `enabled` (ARCHITECTURE.md "One `enabled` per key"): the UI store's per-account latch.
  const ui = useUiStore()
  const accountId = computed(() => user.value?.id ?? null)
  const pickerOpened = computed(() => accountId.value !== null && ui.userPickerOpenedBy === accountId.value)

  const searchTerm = ref('')
  const term = refDebounced(computed(() => searchTerm.value.trim()), 300)
  const { data, status, asyncStatus } = useQuery(() => ({
    ...usersListQuery({ search: term.value || undefined, limit: PICKER_LIMIT }),
    placeholderData: keepPreviousData<UsersListResponse>,
    enabled: canRead.value && pickerOpened.value
  }))

  const selectedId = computed(() => toValue(options.selectedId) || undefined)
  const chosen = ref<UserPickerOption | null>(null)
  const { label: selectedLabel } = useUserLabel(computed(() => (selectedId.value && isUuid(selectedId.value) ? selectedId.value : '')), ref(undefined))

  const items = computed<UserPickerOption[]>(() => {
    const options = (data.value?.items ?? []).map(optionFor)
    const id = selectedId.value
    if (id && !options.some(o => o.value === id)) {
      options.unshift(chosen.value?.value === id ? chosen.value : { label: isUuid(id) ? selectedLabel.value : 'Unknown account', value: id })
    }
    return options
  })
  watch(selectedId, (id) => {
    chosen.value = (id && items.value.find(o => o.value === id)) || null
  })

  const loading = computed(() => pickerOpened.value && (status.value === 'pending' || asyncStatus.value === 'loading'))
  const hint = computed(() => {
    const total = data.value?.total ?? 0
    const shown = data.value?.items.length ?? 0
    if (total > shown) return `Showing ${shown} of ${total}. Type to narrow the search.`
    return null
  })

  function onOpen(open: boolean) {
    if (open && accountId.value) ui.markUserPickerOpened(accountId.value)
  }

  return { searchTerm, items, loading, status, hint, onOpen }
}
