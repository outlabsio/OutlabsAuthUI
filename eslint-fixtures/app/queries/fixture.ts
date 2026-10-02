// app/queries/<resource>.ts is the one place that calls apiClient; still never a raw request.
import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { $fetch as nuxtFetch } from '#imports' // expect-error: @typescript-eslint/no-restricted-imports

export const fixtureListQuery = defineQueryOptions(() => ({
  key: ['fixture'],
  query: ({ signal }) => apiClient.get('/fixture/', { signal })
}))

export function useFixtureSave() {
  return useMutation({ mutation: (body: object) => apiClient.post('/fixture/', body) })
}

export const rawFixture = () => fetch('/v1/fixture/') // expect-error: no-restricted-globals
export const windowFixture = () => window.fetch('/v1/fixture/') // expect-error: no-restricted-properties
export const nuxtFixture = () => nuxtFetch('/v1/fixture/')
