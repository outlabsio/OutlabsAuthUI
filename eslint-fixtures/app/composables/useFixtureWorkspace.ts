// A composable may run queries from app/queries and use the client's error helpers, but never
// the client itself or a raw request.
import { apiClient } from '~/api/client' // expect-error: @typescript-eslint/no-restricted-imports
import { describeAuthError, type ApiRequestOptions } from '~/api/client'
import { usersListQuery } from '~/queries/users'
import { useLazyFetch } from '#imports' // expect-error: @typescript-eslint/no-restricted-imports
import { useQueryCache as cacheOf } from '#imports'

export function useFixtureWorkspace(options: ApiRequestOptions) {
  const list = useQuery(usersListQuery, () => ({ limit: 25 }))
  const cache = useQueryCache()
  const raw = fetch('/v1/users/') // expect-error: no-restricted-globals
  const viaNuxt = useNuxtApp().$fetch('/v1/users/') // expect-error: no-restricted-properties
  const direct = apiClient.get('/users/', options)
  return { list, cache, raw, viaNuxt, direct, describeAuthError, useLazyFetch, cacheOf }
}
