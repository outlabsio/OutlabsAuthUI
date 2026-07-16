import type {
  AuditEventsResponse,
  GetAuditEventsParams,
} from '@/features/audit/types/audit.types'
import { apiClient } from '@/lib/api/client'

export function getAuditEvents(params: GetAuditEventsParams = {}) {
  const searchParams = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  })

  if (params.category) {
    searchParams.set('category', params.category)
  }

  if (params.eventType) {
    searchParams.set('event_type', params.eventType)
  }

  if (params.subjectUserId) {
    searchParams.set('subject_user_id', params.subjectUserId)
  }

  if (params.actorUserId) {
    searchParams.set('actor_user_id', params.actorUserId)
  }

  if (params.entityId) {
    searchParams.set('entity_id', params.entityId)
  }

  if (params.occurredFrom) {
    searchParams.set('occurred_from', params.occurredFrom)
  }

  if (params.occurredTo) {
    searchParams.set('occurred_to', params.occurredTo)
  }

  return apiClient.get<AuditEventsResponse>(
    `/audit-events?${searchParams.toString()}`
  )
}
