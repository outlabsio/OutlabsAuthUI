import type {
  GetUserAuditEventsParams,
  UserAuditEventsResponse,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUserAuditEvents(
  userId: string,
  params: GetUserAuditEventsParams = {},
  options: { signal?: AbortSignal } = {}
) {
  const searchParams = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 6),
  })

  if (params.category) {
    searchParams.set('category', params.category)
  }

  if (params.eventType) {
    searchParams.set('event_type', params.eventType)
  }

  if (params.entityId) {
    searchParams.set('entity_id', params.entityId)
  }

  return apiClient.get<UserAuditEventsResponse>(
    `/users/${userId}/audit-events?${searchParams.toString()}`,
    { signal: options.signal }
  )
}
