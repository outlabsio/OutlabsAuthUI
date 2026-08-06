import type { PaginatedResponse } from '~/types/auth'

// The audit workspace (activity_tracking capability + user:read permission). One event per
// recorded action; before/after/metadata carry the inspectable payload. Mirrors the React
// feature's UserAuditEvent shape and the /audit-events contract.
export type UserAuditEvent = {
  id: string
  occurred_at: string
  event_category: string
  event_type: string
  event_source: string
  actor_user_id?: string | null
  subject_user_id?: string | null
  subject_email_snapshot: string
  root_entity_id?: string | null
  entity_id?: string | null
  role_id?: string | null
  request_id?: string | null
  ip_address?: string | null
  user_agent?: string | null
  reason?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export type AuditEventsResponse = PaginatedResponse<UserAuditEvent>

// Applied filters (the query inputs). Empty strings mean "unset" and are dropped before the
// request; occurred* are datetime-local strings converted to ISO at the query boundary.
export type AuditFilters = {
  category: string
  eventType: string
  subjectUserId: string
  actorUserId: string
  entityId: string
  occurredFrom: string
  occurredTo: string
}

export const emptyAuditFilters: AuditFilters = {
  category: '',
  eventType: '',
  subjectUserId: '',
  actorUserId: '',
  entityId: '',
  occurredFrom: '',
  occurredTo: ''
}

// URL <-> filters. The filters live in the route query (deep-linkable); page is local state.
export function auditFiltersFromQuery(query: Record<string, unknown>): AuditFilters {
  const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '')
  return {
    category: str(query.category),
    eventType: str(query.eventType),
    subjectUserId: str(query.subjectUserId),
    actorUserId: str(query.actorUserId),
    entityId: str(query.entityId),
    occurredFrom: str(query.occurredFrom),
    occurredTo: str(query.occurredTo)
  }
}

// Only the set filters become query params — keeps deep-link URLs clean.
export function auditFiltersToQuery(filters: AuditFilters): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim()
    if (trimmed) next[key] = trimmed
  }
  return next
}
