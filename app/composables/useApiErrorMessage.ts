import { toValue, type MaybeRefOrGetter } from 'vue'
import { getApiErrorMessage, normalizeApiError, type NormalizedApiError } from '~/api/errors'

// A query's error -> a human-readable message, in one place. Pass a query's `error` ref (or a
// getter); use for the "Could not load ..." alerts. The copy comes from the error model
// (app/api/errors.ts): not-found, denied, rate-limited, server and network failures each read
// differently, and the API's developer text is never shown raw.
export function useApiErrorMessage(source: MaybeRefOrGetter<unknown>) {
  return computed(() => getApiErrorMessage(toValue(source)))
}

// The classified error (kind, status, code, missing permissions, ...) or null when there is none,
// for views that render not-found or denied states differently from a failed load.
export function useApiError(source: MaybeRefOrGetter<unknown>) {
  return computed<NormalizedApiError | null>(() => {
    const error = toValue(source)
    return error == null ? null : normalizeApiError(error)
  })
}
