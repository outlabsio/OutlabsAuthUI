import type { PaginatedResponse } from '~/types/auth'

// Pagination helpers shared by list pages and catalogue queries. Pure: the page fetcher is a
// parameter, so the query layer owns the IO and these stay unit-testable.

// Number of pages for `total` rows at `pageSize` per page (at least 1, so UPagination and the
// clamp below always have a valid last page).
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1
  return Math.ceil(total / pageSize)
}

// Keep a page inside [1, pageCount].
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, Math.trunc(page) || 1), pageCount(total, pageSize))
}

// The 1-based row range a page shows: { from: 26, to: 41 } for page 2 of 41 at 25/page.
// Empty lists give { from: 0, to: 0 }.
export function pageRange(page: number, pageSize: number, total: number): { from: number, to: number } {
  if (total <= 0) return { from: 0, to: 0 }
  const from = (clampPage(page, total, pageSize) - 1) * pageSize + 1
  return { from, to: Math.min(total, from + pageSize - 1) }
}

// "1 permission", "41 permissions"
export function countLabel(count: number, noun: string, plural = `${noun}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : plural}`
}

// "Showing 26–41 of 41 permissions" / "1 permission" / "No permissions"
export function listSummary(page: number, pageSize: number, total: number, noun: string, plural = `${noun}s`): string {
  if (total <= 0) return `No ${plural}`
  if (total <= pageSize) return countLabel(total, noun, plural)
  const { from, to } = pageRange(page, pageSize, total)
  return `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${countLabel(total, noun, plural)}`
}

// Slice one page out of an in-memory list (for lists the API cannot filter server-side).
export function slicePage<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = (clampPage(page, rows.length, pageSize) - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

export type CollectAllPagesOptions = {
  // Rows per request; use the endpoint's maximum (1000 for /permissions and /entities).
  pageSize: number
  // Hard stop so a misbehaving API cannot loop forever. Default 100 pages.
  maxPages?: number
}

export type CollectedPages<T> = {
  items: T[]
  total: number
  // False when maxPages stopped the walk before `total` rows arrived. Callers must surface it
  // (never cap silently).
  complete: boolean
}

// Walk every page of a paginated endpoint and return all rows. For catalogues that must be
// complete (every permission, every role for chip resolution, an entity subtree), replacing
// the single `limit=1000` request that silently truncated larger tenants.
export async function collectAllPages<T>(
  // Only the rows, the total and (when the API sends it) the page count are read.
  fetchPage: (page: number, pageSize: number) => Promise<Pick<PaginatedResponse<T>, 'items' | 'total'> & { pages?: number | null }>,
  options: CollectAllPagesOptions
): Promise<CollectedPages<T>> {
  const maxPages = options.maxPages ?? 100
  const items: T[] = []
  let total = 0
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    if (page > maxPages) return { items, total, complete: false }
    const response = await fetchPage(page, options.pageSize)
    items.push(...response.items)
    total = response.total
    pages = response.pages ?? pageCount(response.total, options.pageSize)
    if (!response.items.length) break
  }
  return { items, total, complete: items.length >= total }
}
