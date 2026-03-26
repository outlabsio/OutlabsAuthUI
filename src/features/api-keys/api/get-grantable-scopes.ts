import type {
  ApiKeyGrantableScopes,
  GetGrantableScopesInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export async function getGrantableScopes({
  entityId,
  ownerId,
  keyKind = 'personal',
  inherit_from_tree = false,
}: GetGrantableScopesInput) {
  const searchParams = new URLSearchParams({
    key_kind: keyKind,
    inherit_from_tree: String(inherit_from_tree),
  })

  if (ownerId) {
    searchParams.set('owner_id', ownerId)
  }

  return apiClient.get<ApiKeyGrantableScopes>(
    `/admin/entities/${entityId}/grantable-scopes?${searchParams.toString()}`
  )
}
