import { useMutation, useMutationCache, type UseMutationOptions } from '@pinia/colada'

// A mutation whose result carries a one-time secret: an API key's plaintext from create or
// rotate (F-183). Use it instead of `useMutation` for every such endpoint.
//
// Why: Pinia Colada keeps each mutation's result (`data`) in its mutation cache, a Pinia store,
// while the component that ran it is mounted and for `gcTime` after that. `reset()` alone only
// swaps in a fresh entry: the old entry, with the plaintext, stays in the cache and is never
// garbage-collected. So once the secret has been handed to AppSecretReveal, call `discard()`:
// it evicts every settled entry of this mutation from the cache, resets it, and re-reads `data`
// so the cached computed drops its reference too. `gcTime: 0` evicts at once anything that is
// still there when the component unmounts or a new call supersedes an entry.
//
//   const createKey = useCreateApiKey()                       // built on useSecretMutation
//   const res = await run(() => createKey.mutateAsync(input), { ... })
//   if (res.ok) {
//     revealed.value = oneTimeSecretFrom(res.data)            // AppSecretReveal holds it now
//     createKey.discard()                                     // and nothing else does
//   }
export function useSecretMutation<TData, TVars = void>(options: UseMutationOptions<TData, TVars>) {
  const mutationCache = useMutationCache()
  const mutation = useMutation<TData, TVars>({ ...options, gcTime: 0 })

  function discard() {
    const settled = mutationCache.getEntries({
      predicate: entry => entry.options.mutation === options.mutation && entry.asyncStatus.value !== 'loading'
    })
    for (const entry of settled) mutationCache.remove(entry)
    mutation.reset()
    // `data` is a cached computed: reading it after the reset recomputes it from the new, empty
    // entry, so it no longer references the old response.
    void mutation.data.value
  }

  return { ...mutation, discard }
}
