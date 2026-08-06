import { initializeRuntimeConfig, type RuntimeConfig, type RuntimeConfigError, type RuntimeConfigInput } from '~/utils/runtime-config'
import { useSessionStore } from '~/stores/session'

// Runs first (00 prefix), client-only, async — blocks app mount until the backend target
// is resolved from /app-config.json + NUXT_PUBLIC_* env. Mirrors the React app's
// initializeRuntimeConfig boot gate. On error we surface a hard config-error screen
// (app.vue) instead of booting against the wrong API.
export default defineNuxtPlugin(async () => {
  const configState = useState<RuntimeConfig | null>('app:runtime-config', () => null)
  const errorState = useState<RuntimeConfigError | null>('app:config-error', () => null)

  const publicConfig = useRuntimeConfig().public as RuntimeConfigInput
  const result = await initializeRuntimeConfig(publicConfig)

  if (result.status === 'error') {
    errorState.value = result.error
    return
  }

  configState.value = result.config

  // Hydrate the session before the first guarded navigation is evaluated.
  const session = useSessionStore()
  session.bindExpiryListener()
  await session.restore()
})
