import type { PaginatedResponse } from '~/types/auth'
import type { ResponseBody, Schemas } from '~/types/wire'

// The audit search (GET /audit-events; audit surface + activity_tracking + user:read). One event
// per recorded account action; before/after/metadata carry the inspectable payload.
export type UserAuditEvent = ResponseBody<Schemas['UserAuditEventResponse']>

export type AuditEventsResponse = PaginatedResponse<UserAuditEvent>

// The Audit workspace's filters, as kept in the route query (utils/audit.ts turns them into
// request parameters). Empty strings mean "unset". `range` is a relative window preset
// ('24h', '7d', ...); otherwise occurredFrom/occurredTo bound the search by day (YYYY-MM-DD).
export type AuditFilters = {
  category: string
  eventType: string
  subjectUserId: string
  actorUserId: string
  entityId: string
  range: string
  occurredFrom: string
  occurredTo: string
}

export const emptyAuditFilters: AuditFilters = {
  category: '',
  eventType: '',
  subjectUserId: '',
  actorUserId: '',
  entityId: '',
  range: '',
  occurredFrom: '',
  occurredTo: ''
}
