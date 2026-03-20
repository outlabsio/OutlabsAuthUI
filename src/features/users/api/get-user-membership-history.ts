import type {
  GetUserMembershipHistoryParams,
  UserMembershipHistoryResponse,
} from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function getUserMembershipHistory(
  userId: string,
  params: GetUserMembershipHistoryParams = {}
) {
  const searchParams = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 6),
  })

  if (params.entityId) {
    searchParams.set('entity_id', params.entityId)
  }

  if (params.eventType) {
    searchParams.set('event_type', params.eventType)
  }

  return apiClient.get<UserMembershipHistoryResponse>(
    `/users/${userId}/membership-history?${searchParams.toString()}`
  )
}
