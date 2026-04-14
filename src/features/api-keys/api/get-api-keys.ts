import type {
  ApiKeysListResponse,
  ListEntityApiKeysParams,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

const defaultListParams: Required<Pick<ListEntityApiKeysParams, 'page' | 'limit'>> = {
  page: 1,
  limit: 20,
}

export function getApiKeys({
  entityId,
  page = defaultListParams.page,
  limit = defaultListParams.limit,
  ownerId,
  status,
  keyKind,
  search,
}: ListEntityApiKeysParams) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (keyKind) {
    searchParams.set('key_kind', keyKind)
  }

  if (ownerId) {
    searchParams.set('owner_id', ownerId)
  }

  if (status) {
    searchParams.set('status', status)
  }

  if (search) {
    searchParams.set('search', search)
  }

  return apiClient.get<ApiKeysListResponse>(
    `/admin/entities/${entityId}/api-keys?${searchParams.toString()}`
  )
}
