import { defineQueryOptions } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type { AuditEventsResponse, AuditFilters } from '~/types/audit'

// Audit is read-only server state (activity_tracking capability + user:read permission).
// Key: ['audit', 'list', {page, limit, filters}]. No mutations — the log is append-only.

export type AuditListParams = {
  page: number
  limit: number
  filters: AuditFilters
}

function toIso(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function buildAuditQueryString({ page, limit, filters }: AuditListParams): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (filters.category.trim()) params.set('category', filters.category.trim())
  if (filters.eventType.trim()) params.set('event_type', filters.eventType.trim())
  if (filters.subjectUserId.trim()) params.set('subject_user_id', filters.subjectUserId.trim())
  if (filters.actorUserId.trim()) params.set('actor_user_id', filters.actorUserId.trim())
  if (filters.entityId.trim()) params.set('entity_id', filters.entityId.trim())
  const from = toIso(filters.occurredFrom)
  if (from) params.set('occurred_from', from)
  const to = toIso(filters.occurredTo)
  if (to) params.set('occurred_to', to)
  return params.toString()
}

export const auditEventsQuery = defineQueryOptions((params: AuditListParams) => ({
  key: ['audit', 'list', params],
  query: ctx =>
    apiClient.get<AuditEventsResponse>(`/audit-events?${buildAuditQueryString(params)}`, { signal: ctx?.signal })
}))
