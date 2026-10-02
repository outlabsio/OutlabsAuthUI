import { defineQueryOptions } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { keepPreviousPage } from '~/queries/freshness'
import { auditRequestParams } from '~/utils/audit'
import type { AuditEventsResponse, AuditFilters, UserAuditEvent } from '~/types/audit'

// Audit is read-only server state (audit surface + activity_tracking + user:read).
// Key: ['audit', 'list', {page, limit, filters}]. No mutations: the log is append-only.
// A relative range ('7d') is in the key by id and resolved to an instant when the request is
// made, so the key stays stable and a refetch searches the window up to now.

export type AuditListParams = {
  page: number
  limit: number
  filters: AuditFilters
}

function fetchAuditPage({ page, limit, filters }: AuditListParams, signal?: AbortSignal, window: { now?: number, until?: number } = {}) {
  return apiClient.get<AuditEventsResponse>(`/audit-events?${auditRequestParams(filters, { page, limit, ...window }).toString()}`, { signal })
}

export const auditEventsQuery = defineQueryOptions((params: AuditListParams) => ({
  key: ['audit', 'list', params],
  query: ctx => fetchAuditPage(params, ctx?.signal),
  placeholderData: keepPreviousPage<AuditEventsResponse>
}))

export type AuditExportProgress = { loaded: number, total: number }
export type AuditExportResult = { events: UserAuditEvent[], total: number, complete: boolean }

// Every event matching `filters` (F-190), newest first, in pages of 100 (the API's maximum),
// up to `maxEvents`. Not cached: an export is a one-off read of the moment it runs. Rejects
// with the request's error, or with an AbortError when `signal` aborts.
export async function exportAuditEvents(
  filters: AuditFilters,
  options: { maxEvents: number, signal?: AbortSignal, onProgress?: (progress: AuditExportProgress) => void }
): Promise<AuditExportResult> {
  const limit = 100
  // One fixed window for every page: a relative range resolves once, and the upper bound is
  // pinned to now, so events recorded during the export never shift rows between pages.
  const now = Date.now()
  const events: UserAuditEvent[] = []
  let total = 0
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const response = await fetchAuditPage({ page, limit, filters }, options.signal, { now, until: now })
    events.push(...response.items)
    total = response.total
    pages = response.pages ?? Math.ceil(total / limit)
    options.onProgress?.({ loaded: Math.min(events.length, options.maxEvents), total })
    if (events.length >= options.maxEvents) break
    if (!response.items.length) break
  }
  const capped = events.slice(0, options.maxEvents)
  return { events: capped, total, complete: capped.length >= total }
}
