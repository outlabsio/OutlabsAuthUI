import { toValue } from 'vue'
import type { DataState, PiniaColadaPlugin, UseQueryEntry } from '@pinia/colada'
import { ApiError } from '../api/errors'

// Transient-only retry for reads (Pinia Colada queries; mutations are never retried). A query
// that got no answer, or a 502/503/504 from a proxy or a restarting API, is fetched again after a
// short backoff; anything the API actually decided (4xx, 500, 429 rate limits) and timeouts (the
// user already waited DEFAULT_REQUEST_TIMEOUT_MS) surface at once.
//
// While a retry is pending the entry keeps its previous state (data, or loading). The failure is
// swapped out synchronously, right after the cache records it and before Vue flushes watchers,
// so a blip never reaches a view or a watcher (for example the shell's capabilities notice).
//
// Modelled on the official @pinia/colada-plugin-retry, which needs a newer @pinia/colada.

export type TransientRetryOptions = {
  // Retries after the first failure.
  retries?: number
  // Delay before retry `attempt` (0-based), in ms.
  delay?: (attempt: number) => number
}

/** Reads worth fetching again as-is: no answer, or a gateway/unavailable answer. */
export function isRetryableReadError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.kind === 'network') return true
  return error.kind === 'http' && (error.status === 502 || error.status === 503 || error.status === 504)
}

type Retry = { count: number, previous: DataState<unknown, unknown, unknown>, timer?: ReturnType<typeof setTimeout> }

export function PiniaColadaTransientRetry({ retries = 2, delay = attempt => 500 * 2 ** attempt }: TransientRetryOptions = {}): PiniaColadaPlugin {
  return ({ queryCache }) => {
    const retriesByEntry = new WeakMap<UseQueryEntry, Retry>()
    let internalFetch = false

    function stop(entry: UseQueryEntry) {
      const retry = retriesByEntry.get(entry)
      if (retry?.timer) clearTimeout(retry.timer)
      retriesByEntry.delete(entry)
    }

    queryCache.$onAction(({ name, args, after }) => {
      if (name === 'remove' || name === 'cancel') {
        stop(args[0] as UseQueryEntry)
        return
      }

      if (name === 'fetch') {
        const entry = args[0] as UseQueryEntry
        const existing = retriesByEntry.get(entry)
        if (internalFetch && existing) return
        // A fetch the app started (mount, invalidation, refetch) restarts the retry budget.
        stop(entry)
        retriesByEntry.set(entry, { count: 0, previous: entry.state.value })
        return
      }

      if (name !== 'setEntryState') return
      const [entry, state] = args as [UseQueryEntry, DataState<unknown, unknown, unknown>]
      const retry = retriesByEntry.get(entry)
      if (!retry || !entry.pending) return
      if (state.status !== 'error') {
        retriesByEntry.delete(entry)
        return
      }
      if (!isRetryableReadError(state.error) || retry.count >= retries) {
        retriesByEntry.delete(entry)
        return
      }
      // Runs synchronously after the action, before any watcher sees the failure.
      after(() => {
        const failed = entry.state.value
        entry.state.value = retry.previous
        entry.when = 0
        if (retry.timer) clearTimeout(retry.timer)
        retry.timer = setTimeout(() => {
          retry.timer = undefined
          if (!entry.active || toValue(entry.options?.enabled) === false) {
            // Nobody is looking any more: settle on the failure without fetching again.
            retriesByEntry.delete(entry)
            entry.state.value = failed
            return
          }
          retry.count += 1
          internalFetch = true
          try {
            queryCache.fetch(entry).catch(() => {})
          } finally {
            internalFetch = false
          }
        }, delay(retry.count))
      })
    })
  }
}
