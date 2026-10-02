import type { LocationQuery, LocationQueryRaw } from 'vue-router'

// Pure half of useListQueryState: a list's search term, page and filters <-> the route query.
// Only values that differ from their defaults are written, so a pristine list has a clean URL
// and every filtered view is a shareable, reloadable, Back-able address.

export type ListFilterValue = string | number | boolean
export type ListFilterDefaults = Record<string, ListFilterValue>

export type ListQuerySpec<F extends ListFilterDefaults> = {
  // Default value per filter. The default's type decides how the query string is parsed.
  filters: F
  // Optional allow-list per filter; any other value in the URL falls back to the default.
  allowed?: { [K in keyof F]?: readonly F[K][] }
  // Route query key for the search term; null disables search. Default 'q'.
  searchParam?: string | null
  // Route query key for the page number. Default 'page'.
  pageParam?: string
}

export type ListQueryValues<F extends ListFilterDefaults> = {
  search: string
  page: number
  filters: F
}

function first(value: LocationQuery[string] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === null || raw === undefined ? undefined : raw
}

function parseFilter<V extends ListFilterValue>(raw: string | undefined, fallback: V, allowed?: readonly V[]): V {
  if (raw === undefined) return fallback
  let parsed: ListFilterValue
  if (typeof fallback === 'boolean') {
    if (raw === 'true' || raw === '1') parsed = true
    else if (raw === 'false' || raw === '0') parsed = false
    else return fallback
  } else if (typeof fallback === 'number') {
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) return fallback
    parsed = n
  } else {
    parsed = raw
  }
  if (allowed && !allowed.includes(parsed as V)) return fallback
  return parsed as V
}

export function parsePageParam(raw: string | undefined): number {
  if (!raw || !/^\d+$/.test(raw)) return 1
  const n = Number(raw)
  return n >= 1 && Number.isSafeInteger(n) ? n : 1
}

export function parseListQuery<F extends ListFilterDefaults>(query: LocationQuery, spec: ListQuerySpec<F>): ListQueryValues<F> {
  const searchParam = spec.searchParam === undefined ? 'q' : spec.searchParam
  const pageParam = spec.pageParam ?? 'page'
  const filters = {} as F
  for (const key of Object.keys(spec.filters) as (keyof F & string)[]) {
    filters[key] = parseFilter(first(query[key]), spec.filters[key], spec.allowed?.[key])
  }
  return {
    search: searchParam ? (first(query[searchParam]) ?? '').trim() : '',
    page: parsePageParam(first(query[pageParam])),
    filters
  }
}

// The route keys this list owns.
export function listQueryKeys<F extends ListFilterDefaults>(spec: ListQuerySpec<F>): string[] {
  const searchParam = spec.searchParam === undefined ? 'q' : spec.searchParam
  return [...(searchParam ? [searchParam] : []), spec.pageParam ?? 'page', ...Object.keys(spec.filters)]
}

// Only the non-default values, as strings.
export function serializeListQuery<F extends ListFilterDefaults>(values: ListQueryValues<F>, spec: ListQuerySpec<F>): Record<string, string> {
  const searchParam = spec.searchParam === undefined ? 'q' : spec.searchParam
  const out: Record<string, string> = {}
  const search = values.search.trim()
  if (searchParam && search) out[searchParam] = search
  if (values.page > 1) out[spec.pageParam ?? 'page'] = String(values.page)
  for (const key of Object.keys(spec.filters) as (keyof F & string)[]) {
    const value = values.filters[key]
    if (value !== spec.filters[key]) out[key] = String(value)
  }
  return out
}

// The next route query: `current` with this list's keys replaced by `values` (keys owned by
// other features — `?entity=`, `?recover=` — are kept untouched).
export function mergeListQuery<F extends ListFilterDefaults>(current: LocationQuery, values: ListQueryValues<F>, spec: ListQuerySpec<F>): LocationQueryRaw {
  const owned = new Set(listQueryKeys(spec))
  const next: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(current)) {
    if (!owned.has(key)) next[key] = value
  }
  return { ...next, ...serializeListQuery(values, spec) }
}

export function sameListValues<F extends ListFilterDefaults>(a: ListQueryValues<F>, b: ListQueryValues<F>): boolean {
  if (a.search !== b.search || a.page !== b.page) return false
  const keys = new Set([...Object.keys(a.filters), ...Object.keys(b.filters)])
  for (const key of keys) {
    if (a.filters[key] !== b.filters[key]) return false
  }
  return true
}

// Compare two route queries by their string content (order-insensitive).
export function sameRouteQuery(a: LocationQueryRaw, b: LocationQueryRaw): boolean {
  const norm = (q: LocationQueryRaw) => JSON.stringify(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v.map(x => (x === null ? null : String(x))) : v === null ? null : String(v)])
      .sort(([x], [y]) => String(x).localeCompare(String(y)))
  )
  return norm(a) === norm(b)
}
