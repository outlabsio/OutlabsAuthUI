import { queryOptions } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { getApiKeys } from '@/features/api-keys/api/get-api-keys'

export function getApiKeysQueryOptions() {
  return queryOptions({
    queryKey: apiKeysKeys.list(),
    queryFn: getApiKeys,
  })
}
