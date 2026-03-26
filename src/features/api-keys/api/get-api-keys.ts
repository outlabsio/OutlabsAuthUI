import type {
  ApiKeysListResponse,
  ListEntityApiKeysParams,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

const defaultListParams: Required<Pick<ListEntityApiKeysParams, 'page' | 'limit' | 'keyKind'>> = {
  page: 1,
  limit: 20,
  keyKind: 'personal',
}

export function getApiKeys({
  entityId,
  page = defaultListParams.page,
  limit = defaultListParams.limit,
  ownerId,
  status,
  keyKind = defaultListParams.keyKind,
  search,
}: ListEntityApiKeysParams) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    key_kind: keyKind,
  })

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
