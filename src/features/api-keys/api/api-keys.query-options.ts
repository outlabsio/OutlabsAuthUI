import { queryOptions } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { getGrantableScopes } from '@/features/api-keys/api/get-grantable-scopes'
import { getApiKeys } from '@/features/api-keys/api/get-api-keys'
import type {
  GetGrantableScopesInput,
  ListEntityApiKeysParams,
} from '@/features/api-keys/types/api-keys.types'

export function getApiKeysQueryOptions(params: ListEntityApiKeysParams) {
  return queryOptions({
    queryKey: apiKeysKeys.list(params),
    queryFn: () => getApiKeys(params),
  })
}

export function getGrantableScopesQueryOptions(params: GetGrantableScopesInput) {
  return queryOptions({
    queryKey: apiKeysKeys.grantableScopes(params),
    queryFn: () => getGrantableScopes(params),
  })
}
