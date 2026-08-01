import type {
  ApiKeyGrantableScopes,
  GetGrantableScopesInput,
} from '@/features/api-keys/types/api-keys.types'
import { apiClient } from '@/lib/api/client'

export async function getGrantableScopes(
  { entityId, inherit_from_tree = false }: GetGrantableScopesInput,
  options: { signal?: AbortSignal } = {}
) {
  const searchParams = new URLSearchParams()

  if (entityId) {
    searchParams.set('entity_id', entityId)
  }

  searchParams.set('inherit_from_tree', String(inherit_from_tree))

  const query = searchParams.toString()

  return apiClient.get<ApiKeyGrantableScopes>(
    `/api-keys/grantable-scopes${query ? `?${query}` : ''}`,
    { signal: options.signal }
  )
}
