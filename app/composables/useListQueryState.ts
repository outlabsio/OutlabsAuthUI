import type { Ref, WritableComputedRef } from 'vue'
import { watchDebounced } from '@vueuse/core'
import {
  mergeListQuery,
  parseListQuery,
  sameListValues,
  sameRouteQuery,
  type ListFilterDefaults,
  type ListQuerySpec,
  type ListQueryValues
} from '~/utils/list-query'
import { clampPage, pageCount } from '~/utils/pagination'

// Shared list conventions (F-125/F-126): the search term, page and filters of a list live in
// the route query, so a filtered view survives reload, Back from a detail page and sharing.
// - `search` is bound to the search input and updates immediately; `searchTerm` is the trimmed
//   value committed ~300 ms after typing stops — put THAT in the query key (one request per
//   pause, not per keystroke).
// - Changing a filter or the committed search returns to page 1. Changing the page does not.
// - URL writes use router.replace, so the history entry of the list follows its state and Back
//   from a detail page lands on the filtered view.
// - Pair it with `placeholderData: keepPreviousData` on the list query, so the table keeps its
//   rows while the next page or filter loads instead of flashing empty.
//
// const list = useListQueryState({ filters: { status: 'active' as UserStatusFilter }, pageSize: 25 })
// const { data, status } = useQuery(() => ({
//   ...usersListQuery({ page: list.page.value, limit: list.pageSize.value, search: list.searchTerm.value || undefined, status: list.filters.status.value }),
//   placeholderData: keepPreviousData<UsersListResponse>,
//   enabled: canRead.value
// }))
// list.syncTotal(() => data.value?.total)

export type ListQueryStateOptions<F extends ListFilterDefaults> = ListQuerySpec<F> & {
  // Rows per page. Default 25.
  pageSize?: number
  // Debounce for committing the search input, in ms. Default 300.
  debounce?: number
}

export type ListFilterRefs<F extends ListFilterDefaults> = { [K in keyof F]: WritableComputedRef<F[K]> }

export type ListQueryState<F extends ListFilterDefaults> = {
  // Bound to the search input (v-model). Immediate.
  search: WritableComputedRef<string>
  // The committed, trimmed, debounced term. Use in query keys. '' = no search.
  searchTerm: Readonly<Ref<string>>
  // 1-based page (v-model:page on UPagination).
  page: WritableComputedRef<number>
  pageSize: Ref<number>
  // One writable ref per filter (v-model on USelect/UCheckbox). Setting one resets the page.
  filters: ListFilterRefs<F>
  // Snapshot of the committed values (search, page, filters) for building query params.
  values: Readonly<Ref<ListQueryValues<F>>>
  // True when a search term or any non-default filter is active (drives "no matches" vs empty).
  isFiltered: Readonly<Ref<boolean>>
  // Clear the search and every filter, back to page 1.
  reset: () => void
  // Clamp the page when the total shrinks (last row on the last page deleted, filters
  // narrowed). Pass a getter for the list's total; undefined totals are ignored.
  syncTotal: (total: () => number | undefined) => void
}

// Keep the previous page's rows visible while the next key loads (Pinia Colada
// placeholderData). The status stays 'success' and the table shows its loading bar. Pass the
// response type explicitly (`keepPreviousData<UsersListResponse>`): a bare generic function
// defeats useQuery's inference of the data type.
export function keepPreviousData<T>(previousData: T | undefined): T | undefined {
  return previousData
}

export function useListQueryState<F extends ListFilterDefaults = Record<string, never>>(
  options: Partial<ListQueryStateOptions<F>> = {}
): ListQueryState<F> {
  const spec: ListQuerySpec<F> = {
    filters: (options.filters ?? {}) as F,
    allowed: options.allowed,
    searchParam: options.searchParam,
    pageParam: options.pageParam
  }
  const route = useRoute()
  const router = useRouter()
  // The list's own path: never write this list's query onto another route (the component
  // can still be alive while the router moves to a detail page).
  const ownPath = route.path

  const committed = shallowRef<ListQueryValues<F>>(parseListQuery(route.query, spec))
  const input = ref(committed.value.search)
  const pageSize = ref(options.pageSize ?? 25)

  function commit(patch: Partial<ListQueryValues<F>>) {
    const next = { ...committed.value, ...patch }
    if (!sameListValues(next, committed.value)) committed.value = next
  }

  // Search input -> committed term, debounced. A pull from the URL (below) sets both, so the
  // pending debounce then commits the same value and changes nothing.
  watchDebounced(input, (value) => {
    const term = value.trim()
    if (term !== committed.value.search) commit({ search: term, page: 1 })
  }, { debounce: options.debounce ?? 300 })

  // Committed state -> URL.
  watch(committed, (values) => {
    if (route.path !== ownPath) return
    const next = mergeListQuery(route.query, values, spec)
    if (!sameRouteQuery(next, route.query)) void router.replace({ query: next })
  })

  // URL -> committed state (browser Back/Forward between list states, a link to a filtered
  // view while already on the page).
  watch(() => route.query, (query) => {
    if (route.path !== ownPath) return
    const parsed = parseListQuery(query, spec)
    if (sameListValues(parsed, committed.value)) return
    committed.value = parsed
    if (input.value.trim() !== parsed.search) input.value = parsed.search
  })

  const search = computed({
    get: () => input.value,
    set: (value: string) => { input.value = value }
  })
  const searchTerm = computed(() => committed.value.search)
  const page = computed({
    get: () => committed.value.page,
    set: (value: number) => commit({ page: Math.max(1, Math.trunc(value) || 1) })
  })

  const filters = {} as ListFilterRefs<F>
  for (const key of Object.keys(spec.filters) as (keyof F & string)[]) {
    filters[key] = computed({
      get: () => committed.value.filters[key],
      set: (value: F[typeof key]) => {
        if (value === committed.value.filters[key]) return
        commit({ filters: { ...committed.value.filters, [key]: value }, page: 1 })
      }
    }) as WritableComputedRef<F[typeof key]>
  }

  const isFiltered = computed(() => {
    if (committed.value.search) return true
    return (Object.keys(spec.filters) as (keyof F)[]).some(key => committed.value.filters[key] !== spec.filters[key])
  })

  function reset() {
    input.value = ''
    commit({ search: '', page: 1, filters: { ...spec.filters } })
  }

  function syncTotal(total: () => number | undefined) {
    watch([total, pageSize], ([value, size]) => {
      if (value === undefined) return
      const current = committed.value.page
      if (current > pageCount(value, size)) commit({ page: clampPage(current, value, size) })
    }, { immediate: true })
  }

  return {
    search,
    searchTerm,
    page,
    pageSize,
    filters,
    values: computed(() => committed.value),
    isFiltered,
    reset,
    syncTotal
  }
}
