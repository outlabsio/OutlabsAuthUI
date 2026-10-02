import type { PiniaColadaOptions } from '@pinia/colada'
import { PiniaColadaTransientRetry } from './app/queries/retry-plugin'
import { PiniaColadaDropStaleDataOnError } from './app/queries/stale-data-plugin'

// Global Pinia Colada defaults (loaded by @pinia/colada-nuxt from the project root).
//
// Freshness comes from invalidation, not polling: every mutation marks the views it affects
// stale (app/queries/invalidation.ts). So data is kept fresh for 30 s instead of the library's
// 5 s, which with refetch-on-focus re-downloaded every active query (including 1000-row
// catalogues) each time the window regained focus. Focus and reconnect still refetch data older
// than that, so changes made elsewhere (another admin, another tab) show up. Catalogue queries
// (the permission, role and entity pools behind pickers) set CATALOGUE_STALE_TIME themselves;
// the session and the actor's permissions set theirs in queries/session.ts.
//
// Reads that got no answer or a 502/503/504 are retried twice with backoff; mutations never are.
// A read the API refused (denied, not found, invalid) drops the data it held, so a view never
// shows the previous rows beside the error (F-047); transient failures keep the last good data.
export default {
  queryOptions: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  },
  plugins: [PiniaColadaTransientRetry(), PiniaColadaDropStaleDataOnError()]
} satisfies PiniaColadaOptions
