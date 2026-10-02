import type { DataState, PiniaColadaPlugin, UseQueryEntry } from '@pinia/colada'
import { isTransientApiError } from '../api/errors'

// Pinia Colada keeps a query's previous data when a refetch fails. For an API that answered
// "denied", "not found" or "invalid", that data is no longer true for this actor (their access
// changed, the record is gone, the filter is wrong), yet views would render it beside the error
// (F-047). This plugin drops the data when a fetch fails with such an answer, so the view shows
// its error state alone. Failures that say nothing about the data — no answer, a timeout, 429 or
// 5xx — keep the last good data, as a blip should not blank the screen.

// Identity and capability discovery belong to the session layer (queries/session.ts), which
// decides itself what a failed /users/me or /auth/config means; they are left alone.
const SESSION_OWNED_ROOTS = new Set(['session', 'auth-config', 'my-permissions'])

/** Whether a failed fetch invalidates the data the entry holds. */
export function failureInvalidatesData(error: unknown): boolean {
  return error != null && !isTransientApiError(error)
}

export function PiniaColadaDropStaleDataOnError(): PiniaColadaPlugin {
  return ({ queryCache }) => {
    queryCache.$onAction(({ name, args, after }) => {
      if (name !== 'setEntryState') return
      const [entry, state] = args as [UseQueryEntry, DataState<unknown, unknown, unknown>]
      if (state.status !== 'error' || state.data === undefined || !failureInvalidatesData(state.error)) return
      if (SESSION_OWNED_ROOTS.has(String(entry.key[0]))) return
      after(() => {
        // Still the same failure (another plugin may have replaced it meanwhile).
        if (entry.state.value.status === 'error' && entry.state.value.error === state.error) {
          entry.state.value = { ...entry.state.value, data: undefined } as typeof entry.state.value
        }
      })
    })
  }
}
