import type { PaginatedResponse } from '@/lib/api/paginated-response.types'
import type { UserAuditEvent } from '@/features/users/types/users.types'

export type { UserAuditEvent }

export type AuditEventsResponse = PaginatedResponse<UserAuditEvent>

export type GetAuditEventsParams = {
  page?: number
  limit?: number
  category?: string
  eventType?: string
  subjectUserId?: string
  actorUserId?: string
  entityId?: string
  occurredFrom?: string
  occurredTo?: string
}

export type AuditFilters = {
  category: string
  eventType: string
  subjectUserId: string
  actorUserId: string
  entityId: string
  occurredFrom: string
  occurredTo: string
}

export type AuditPageSearch = {
  category?: string
  eventType?: string
  subjectUserId?: string
  actorUserId?: string
  entityId?: string
  occurredFrom?: string
  occurredTo?: string
}

export function auditSearchToFilters(search: AuditPageSearch): AuditFilters {
  return {
    category: search.category ?? '',
    eventType: search.eventType ?? '',
    subjectUserId: search.subjectUserId ?? '',
    actorUserId: search.actorUserId ?? '',
    entityId: search.entityId ?? '',
    occurredFrom: search.occurredFrom ?? '',
    occurredTo: search.occurredTo ?? '',
  }
}

export function auditFiltersToSearch(filters: AuditFilters): AuditPageSearch {
  const next: AuditPageSearch = {}

  if (filters.category.trim()) {
    next.category = filters.category.trim()
  }
  if (filters.eventType.trim()) {
    next.eventType = filters.eventType.trim()
  }
  if (filters.subjectUserId.trim()) {
    next.subjectUserId = filters.subjectUserId.trim()
  }
  if (filters.actorUserId.trim()) {
    next.actorUserId = filters.actorUserId.trim()
  }
  if (filters.entityId.trim()) {
    next.entityId = filters.entityId.trim()
  }
  if (filters.occurredFrom.trim()) {
    next.occurredFrom = filters.occurredFrom.trim()
  }
  if (filters.occurredTo.trim()) {
    next.occurredTo = filters.occurredTo.trim()
  }

  return next
}
