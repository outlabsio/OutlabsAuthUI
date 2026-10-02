// A Pinia store holds client state only. It may read the query cache, never run a query.
import { useQueryCache as cacheOf } from '@pinia/colada'
import { defineMutation } from '@pinia/colada' // expect-error: @typescript-eslint/no-restricted-imports
import { useInfiniteQuery as pages, useFetch } from '#imports' // expect-error: @typescript-eslint/no-restricted-imports
import { apiClient } from '~/api/client' // expect-error: @typescript-eslint/no-restricted-imports

export const useFixtureStore = defineStore('fixture', () => {
  const cache = useQueryCache()
  const users = useQuery({ key: ['users'], query: () => Promise.resolve([]) }) // expect-error: no-restricted-globals
  const save = useMutation({ mutation: () => Promise.resolve() }) // expect-error: no-restricted-globals
  const ping = () => globalThis.fetch('/v1/ping') // expect-error: no-restricted-properties
  return { cache, users, save, ping, cacheOf, defineMutation, pages, useFetch, apiClient }
})
