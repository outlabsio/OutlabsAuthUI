import { useQueryCache } from '@pinia/colada'
import { bootErrorFrom } from '~/api/client'
import { initializeRuntimeConfig, type RuntimeConfig, type RuntimeConfigError, type RuntimeConfigInput } from '~/utils/runtime-config'
import { loadAuthConfig, resolveSession } from '~/queries/session'
import type { BootError } from '~/utils/session-lifecycle'

// Runs first (00 prefix), client-only, async — blocks app mount until (1) the backend target
// is resolved from /app-config.json + NUXT_PUBLIC_* env, and (2) the auth server-state is
// seeded into the Colada cache so the auth guard is trustworthy on the first navigation.
// On invalid config we surface a hard config-error screen (app.vue) instead of booting
// against the wrong API. When the API does not answer (or answers in a way that neither
// confirms nor refuses the stored session), the tokens are kept and app.vue shows a screen
// with Retry and Sign out instead.

export default defineNuxtPlugin(async () => {
  const configState = useState<RuntimeConfig | null>('app:runtime-config', () => null)
  const errorState = useState<RuntimeConfigError | null>('app:config-error', () => null)
  const bootError = useState<BootError | null>('app:boot-error', () => null)

  const publicConfig = useRuntimeConfig().public as RuntimeConfigInput
  const result = await initializeRuntimeConfig(publicConfig)

  if (result.status === 'error') {
    errorState.value = result.error
    return
  }

  configState.value = result.config

  const queryCache = useQueryCache()

  // Capability discovery and the stored session resolve in parallel; permissions follow once
  // the capabilities say where they live. A failed discovery is non-fatal (the sign-in page
  // explains an unreachable API; the authConfig query retries on demand).
  const configTask = loadAuthConfig(queryCache)
  const session = await resolveSession(queryCache, configTask)
  // Signed-out boots render the sign-in page, which needs the capabilities settled first.
  await configTask
  if (session.status === 'unreachable') {
    bootError.value = bootErrorFrom(session.error)
  }
})
