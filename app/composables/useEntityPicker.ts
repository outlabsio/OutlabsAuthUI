import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { refDebounced } from '@vueuse/core'
import { entitiesListQuery, entityDescendantsQuery, entityDetailQuery, entityPathsQuery } from '~/queries/entities'
import { entityPickerItems } from '~/utils/entity-picker'
import { indexEntities } from '~/utils/entity-tree'
import type { EntitiesListResponse, Entity, EntityClassValue } from '~/types/entity'

// Data behind AppEntityPicker (F-072). Two modes:
// - Scoped (`rootId` set): the root and its whole subtree load once (GET /entities/{root} +
//   /descendants, not paginated), so every option carries its full path and the picker
//   filters locally. This is the mode for delegated admins and anything org-bound
//   (memberships, invites, moves inside an organisation).
// - Global (no `rootId`; superusers, system-wide admins and accounts without an organisation):
//   server search (GET /entities/?search=, debounced)
//   with `ignore-filter`; with no term it lists the root organisations. Results whose parent
//   chain is unknown resolve it through /entities/{id}/path, so options are still grouped by
//   organisation and show their path. The API caps each search page; when more match, a hint
//   says so instead of truncating silently.
// A delegated admin (useEntityScope) is always anchored on their own organisation: whatever root
// the caller passes, or none, the picker offers that organisation's subtree only (F-020).
// The options themselves (filters, groups, and the bound value kept even when a filter excludes
// it) are utils/entity-picker.ts.

export type EntityPickerFilters = {
  rootId?: MaybeRefOrGetter<string | null | undefined>
  entityClass?: MaybeRefOrGetter<EntityClassValue | null | undefined>
  allowedTypes?: MaybeRefOrGetter<readonly string[] | null | undefined>
  excludeIds?: MaybeRefOrGetter<readonly string[] | null | undefined>
  excludeSubtreeOf?: MaybeRefOrGetter<string | null | undefined>
  includeRoot?: MaybeRefOrGetter<boolean>
  // Offer inactive entities (disabled otherwise). Archived entities are never offered.
  includeInactive?: MaybeRefOrGetter<boolean>
  selectedId?: MaybeRefOrGetter<string | null | undefined>
  // Load nothing until true (e.g. while the dialog is closed).
  enabled?: MaybeRefOrGetter<boolean>
}

const SEARCH_LIMIT = 25
const ROOTS_LIMIT = 50

export function useEntityPicker(filters: EntityPickerFilters) {
  const { anchoredRootId } = useEntityScope()
  const rootId = computed(() => anchoredRootId.value || toValue(filters.rootId) || undefined)
  const enabled = computed(() => toValue(filters.enabled) ?? true)
  const scoped = computed(() => Boolean(rootId.value))
  const entityClass = computed(() => toValue(filters.entityClass) || undefined)

  // --- Scoped mode ---
  const { data: rootData, status: rootStatus, error: rootError, refetch: refetchRoot } = useQuery(() => ({
    ...entityDetailQuery(rootId.value ?? ''),
    enabled: enabled.value && scoped.value
  }))
  const { data: descendantsData, status: descendantsStatus, error: descendantsError, refetch: refetchDescendants } = useQuery(() => ({
    ...entityDescendantsQuery(rootId.value ?? ''),
    enabled: enabled.value && scoped.value
  }))

  // --- Global mode ---
  const searchTerm = ref('')
  const debouncedTerm = refDebounced(computed(() => searchTerm.value.trim()), 300)
  const { data: searchData, status: searchStatus, error: searchError, asyncStatus: searchAsync, refetch: refetchSearch } = useQuery(() => ({
    ...entitiesListQuery(debouncedTerm.value
      ? { search: debouncedTerm.value, limit: SEARCH_LIMIT, entityClass: entityClass.value }
      : { rootOnly: true, limit: ROOTS_LIMIT }),
    placeholderData: keepPreviousData<EntitiesListResponse>,
    enabled: enabled.value && !scoped.value
  }))
  const searchResults = computed<Entity[]>(() => searchData.value?.items ?? [])
  // Ids whose chain is not already known from the results themselves (roots need none).
  const unresolvedIds = computed(() => {
    const known = indexEntities(searchResults.value)
    return searchResults.value
      .filter(e => e.parent_entity_id && !known.has(e.parent_entity_id))
      .map(e => e.id)
  })
  const { data: pathsData } = useQuery(() => ({
    ...entityPathsQuery(unresolvedIds.value),
    enabled: enabled.value && !scoped.value && unresolvedIds.value.length > 0
  }))

  // The selected entity, so the trigger keeps its label when it is not among the results.
  const selectedId = computed(() => toValue(filters.selectedId) || undefined)
  // Also in scoped mode (where the subtree already holds it): the entity detail panel reads the
  // same key, and Pinia Colada keeps one options object per entry, so `enabled: false` here would
  // stop that panel refetching after a write.
  const { data: selectedData, status: selectedStatus } = useQuery(() => ({
    ...entityDetailQuery(selectedId.value ?? ''),
    enabled: enabled.value && Boolean(selectedId.value)
  }))

  // Everything known, for path labels.
  const index = computed(() => {
    if (scoped.value) {
      return indexEntities([...(rootData.value ? [rootData.value] : []), ...(descendantsData.value ?? [])])
    }
    const chains = Object.values(pathsData.value ?? {}).flat()
    return indexEntities([...chains, ...searchResults.value, ...(selectedData.value ? [selectedData.value] : [])])
  })

  const candidates = computed<Entity[]>(() => {
    if (scoped.value) return [...index.value.values()]
    const results = [...searchResults.value]
    if (selectedData.value && !results.some(e => e.id === selectedData.value!.id)) results.push(selectedData.value)
    return results
  })

  // Once the candidates have settled, a selection missing from them gets a placeholder (never
  // its raw id). Scoped: the subtree loaded without it (a delegated admin never reads a foreign
  // entity's name). Global: its own read failed (a successful one is among the candidates).
  const selectionSettled = computed(() => (scoped.value
    ? rootStatus.value === 'success' && descendantsStatus.value === 'success'
    : selectedStatus.value === 'error'))
  const excludeIds = computed(() => [
    ...(toValue(filters.excludeIds) ?? []),
    ...(scoped.value && toValue(filters.includeRoot) === false && rootId.value ? [rootId.value] : [])
  ])

  const items = computed(() => entityPickerItems(candidates.value, index.value, {
    entityClass: entityClass.value,
    allowedTypes: toValue(filters.allowedTypes) ?? null,
    excludeIds: excludeIds.value,
    excludeSubtreeOf: toValue(filters.excludeSubtreeOf) || null,
    includeInactive: toValue(filters.includeInactive) ?? false,
    selectedId: selectedId.value,
    placeholderForUnknown: selectionSettled.value
  }))

  const status = computed(() => (scoped.value
    ? (rootStatus.value === 'error' || descendantsStatus.value === 'error' ? 'error' : rootStatus.value === 'pending' || descendantsStatus.value === 'pending' ? 'pending' : 'success')
    : searchStatus.value))
  const error = computed(() => (scoped.value ? rootError.value ?? descendantsError.value : searchError.value))
  const loading = computed(() => status.value === 'pending' || (!scoped.value && searchAsync.value === 'loading'))

  // Honest limits: say when a global search shows only part of the matches.
  const hint = computed(() => {
    if (scoped.value) return null
    const total = searchData.value?.total ?? 0
    const shown = searchResults.value.length
    if (!debouncedTerm.value) return total > shown ? `Showing ${shown} of ${total} organisations. Type to search every entity.` : 'Type to search every entity.'
    return total > shown ? `Showing ${shown} of ${total} matches. Refine the search to narrow them.` : null
  })

  function retry() {
    if (scoped.value) {
      void refetchRoot()
      void refetchDescendants()
    } else {
      void refetchSearch()
    }
  }

  return {
    // Global mode only: bind to USelectMenu v-model:search-term (with ignore-filter).
    searchTerm,
    serverSearch: computed(() => !scoped.value),
    items,
    status,
    error,
    loading,
    hint,
    retry
  }
}
