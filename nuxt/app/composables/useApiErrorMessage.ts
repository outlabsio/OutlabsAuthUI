import { toValue, type MaybeRefOrGetter } from 'vue'
import { getApiErrorMessage } from '~/api/client'

// A query's error -> a human-readable message, in one place. Pass a query's `error` ref (or a
// getter); use for the "Could not load ..." alerts. Replaces the computed repeated per feature.
export function useApiErrorMessage(source: MaybeRefOrGetter<unknown>) {
  return computed(() => getApiErrorMessage(toValue(source)))
}
