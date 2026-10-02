import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, watch, type EffectScope } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada, useMutation, useQuery, useQueryCache, type PiniaColadaOptions } from '@pinia/colada'
import { ApiError } from '~/api/errors'
import { INVALIDATE_AFTER, QUERY_ROOTS, keysToInvalidate, useInvalidateAfter } from '~/queries/invalidation'
import { MY_PERMISSIONS_KEY, SESSION_KEY } from '~/queries/session'
import { PiniaColadaTransientRetry, isRetryableReadError } from '~/queries/retry-plugin'
import { PiniaColadaDropStaleDataOnError, failureInvalidatesData } from '~/queries/stale-data-plugin'
import coladaOptions from '../../colada.options'

// Server-state freshness: the cross-domain invalidation map, the rule that a failed refetch never
// fails the write that triggered it (F-120), the transient-only read retry and the global
// Pinia Colada defaults (F-227). Runs a real Pinia Colada cache in an effect scope.

let scope: EffectScope | null = null

function createCache(options: PiniaColadaOptions = {}) {
  const app = createApp({ render: () => null })
  app.use(createPinia())
  app.use(PiniaColada, options)
  scope = effectScope()
  return <T>(fn: () => T): T => app.runWithContext(() => scope!.run(fn)!)
}

afterEach(() => {
  scope?.stop()
  scope = null
  vi.useRealTimers()
})

function httpError(status: number) {
  return new ApiError({ message: 'x', status, statusText: '', data: { error: 'X', message: 'x' } })
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('invalidation map', () => {
  it('covers every domain with roots that exist', () => {
    for (const { roots } of Object.values(INVALIDATE_AFTER)) {
      for (const root of roots) expect(QUERY_ROOTS[root]).toBeDefined()
    }
  })

  it('refreshes the views a membership change shows up in', () => {
    const keys = keysToInvalidate('membership', { targetUserId: 'u2', actorId: 'u1' })
    expect(keys).toEqual(expect.arrayContaining([['memberships'], ['users'], ['entities'], ['audit']]))
    expect(keys).not.toContainEqual(MY_PERMISSIONS_KEY)
  })

  it('refreshes the actor\'s own session and permissions when the write targets them', () => {
    const keys = keysToInvalidate('userRoles', { targetUserId: 'u1', actorId: 'u1' })
    expect(keys).toContainEqual(SESSION_KEY)
    expect(keys).toContainEqual(MY_PERMISSIONS_KEY)
  })

  it('an admin revoking a user\'s sessions refreshes that user\'s detail and the audit trail', () => {
    const keys = keysToInvalidate('userSessions', { targetUserId: 'u2', actorId: 'u1' })
    expect(keys).toEqual(expect.arrayContaining([['users'], ['audit']]))
    expect(keys).not.toContainEqual(SESSION_KEY)
  })

  it('always refreshes the actor\'s permissions after a role or permission definition changes', () => {
    expect(keysToInvalidate('role')).toContainEqual(MY_PERMISSIONS_KEY)
    expect(keysToInvalidate('permission')).toContainEqual(MY_PERMISSIONS_KEY)
    expect(keysToInvalidate('apiKey')).not.toContainEqual(MY_PERMISSIONS_KEY)
  })
})

describe('a failed refetch never fails the write (F-120)', () => {
  it('resolves the mutation with its data while the follow-up refetch fails', async () => {
    const inScope = createCache()
    let calls = 0
    const { mutation, legacy, query } = inScope(() => {
      const query = useQuery({
        key: ['api-keys', 'mine'],
        query: async () => {
          calls += 1
          if (calls > 1) throw httpError(500)
          return [{ id: 'k1' }]
        }
      })
      const invalidate = useInvalidateAfter()
      const queryCache = useQueryCache()
      return {
        query,
        mutation: useMutation({
          mutation: async () => ({ api_key: 'example-secret-once' }),
          onSettled: () => invalidate('apiKey')
        }),
        // The pattern this replaced: returning the refetch from onSettled.
        legacy: useMutation({
          mutation: async () => ({ api_key: 'example-secret-twice' }),
          onSettled: () => queryCache.invalidateQueries({ key: ['api-keys'] })
        })
      }
    })
    await flush()
    expect(query.data.value).toEqual([{ id: 'k1' }])

    await expect(mutation.mutateAsync(undefined)).resolves.toEqual({ api_key: 'example-secret-once' })
    await flush()
    // The list refetched and failed on its own; the write still succeeded.
    expect(calls).toBe(2)
    expect(query.error.value).toBeInstanceOf(ApiError)

    await expect(legacy.mutateAsync(undefined)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('transient read retry', () => {
  it('retries only reads that got no answer or a gateway error', () => {
    expect(isRetryableReadError(new ApiError({ kind: 'network', status: 0, statusText: '', data: null, message: 'x' }))).toBe(true)
    expect(isRetryableReadError(httpError(503))).toBe(true)
    expect(isRetryableReadError(httpError(502))).toBe(true)
    expect(isRetryableReadError(httpError(500))).toBe(false)
    expect(isRetryableReadError(httpError(429))).toBe(false)
    expect(isRetryableReadError(httpError(404))).toBe(false)
    expect(isRetryableReadError(new ApiError({ kind: 'timeout', status: 0, statusText: '', data: null, message: 'x' }))).toBe(false)
    expect(isRetryableReadError(new Error('x'))).toBe(false)
  })

  it('recovers from a blip without ever showing the error', async () => {
    vi.useFakeTimers()
    const inScope = createCache({ plugins: [PiniaColadaTransientRetry()] })
    let calls = 0
    const statuses: string[] = []
    const query = inScope(() => {
      const q = useQuery({
        key: ['users', 'list'],
        query: async () => {
          calls += 1
          if (calls <= 2) throw httpError(503)
          return { items: [] }
        }
      })
      watch(q.status, status => statuses.push(status))
      return q
    })
    await flush()
    await vi.advanceTimersByTimeAsync(500)
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(calls).toBe(3)
    expect(query.data.value).toEqual({ items: [] })
    expect(statuses).not.toContain('error')
  })

  it('surfaces a decided failure at once and gives up after two retries', async () => {
    vi.useFakeTimers()
    const inScope = createCache({ plugins: [PiniaColadaTransientRetry()] })
    let decided = 0
    let down = 0
    const [decidedQuery, downQuery] = inScope(() => [
      useQuery({
        key: ['roles', 'list'],
        query: async () => {
          decided += 1
          throw httpError(500)
        }
      }),
      useQuery({
        key: ['permissions', 'list'],
        query: async () => {
          down += 1
          throw httpError(503)
        }
      })
    ])
    await flush()
    expect(decided).toBe(1)
    expect(decidedQuery!.status.value).toBe('error')

    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(down).toBe(3)
    expect(downQuery!.status.value).toBe('error')
  })
})

describe('stale data after a refused read (F-047)', () => {
  it('drops data only for answers that invalidate it', () => {
    expect(failureInvalidatesData(httpError(403))).toBe(true)
    expect(failureInvalidatesData(httpError(404))).toBe(true)
    expect(failureInvalidatesData(httpError(422))).toBe(true)
    expect(failureInvalidatesData(httpError(503))).toBe(false)
    expect(failureInvalidatesData(httpError(429))).toBe(false)
    expect(failureInvalidatesData(new ApiError({ kind: 'network', status: 0, statusText: '', data: null, message: 'x' }))).toBe(false)
  })

  it('hides the previous rows when a refetch is denied, and keeps them through a blip', async () => {
    const inScope = createCache({ plugins: [PiniaColadaDropStaleDataOnError()] })
    let answer: 'ok' | 403 | 503 = 'ok'
    const [denied, session] = inScope(() => [
      useQuery({
        key: ['users', 'list'],
        query: async () => {
          if (answer !== 'ok') throw httpError(answer)
          return { items: [{ id: 'u1' }] }
        }
      }),
      useQuery({
        key: ['session'],
        query: async () => {
          if (answer !== 'ok') throw httpError(answer)
          return { id: 'me' }
        }
      })
    ])
    await flush()
    expect(denied!.data.value).toEqual({ items: [{ id: 'u1' }] })

    answer = 503
    await denied!.refetch()
    expect(denied!.status.value).toBe('error')
    expect(denied!.data.value).toEqual({ items: [{ id: 'u1' }] })

    answer = 403
    await denied!.refetch()
    await session!.refetch()
    expect(denied!.status.value).toBe('error')
    expect(denied!.data.value).toBeUndefined()
    // The session layer owns what a failed identity read means.
    expect(session!.data.value).toEqual({ id: 'me' })
  })
})

describe('global query defaults', () => {
  it('keeps data fresh longer than the library default, retries transient reads, drops refused data', () => {
    expect(coladaOptions.queryOptions?.staleTime).toBeGreaterThanOrEqual(30_000)
    expect(coladaOptions.plugins?.length).toBe(2)
  })
})
