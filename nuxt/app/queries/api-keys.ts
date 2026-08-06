import { defineQueryOptions } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type { ApiKey } from '~/types/api-key'

// P2 vertical (read layer) — the current actor's API keys. GET /api-keys returns a flat
// array, not a paginated envelope. Create/rotate/revoke land in a later pass (scope picker).
export const myApiKeysQuery = defineQueryOptions({
  key: ['api-keys', 'mine'],
  query: ctx => apiClient.get<ApiKey[]>('/api-keys', { signal: ctx?.signal })
})
