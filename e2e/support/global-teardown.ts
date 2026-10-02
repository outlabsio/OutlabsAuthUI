import { ApiClient } from './api-client'
import { cleanupRun } from './cleanup'
import { destructiveCleanupAllowed, runId } from './env'
import { type PersonaKey, resolvePersona } from './personas'
import { readRunManifest } from './run-manifest'
import { loginTokens } from './sessions'

// Runs once after every `playwright test` (whatever projects ran): removes this run's test data
// from a disposable backend when E2E_ALLOW_DESTRUCTIVE_CLEANUP=1. See cleanup.ts for the
// safety model. A cleanup that cannot finish fails the run instead of hiding.

async function adminClient(): Promise<ApiClient> {
  const persona = ApiClient.forPersona('admin')
  try {
    await persona.me()
    return persona
  } catch {
    // The run may have ended the admin's minted session (sign out everywhere, password change):
    // one fresh login with the admin credentials.
    const manifest = readRunManifest()
    const admin = resolvePersona('admin', manifest?.preset ?? null)
    const tokens = await loginTokens(admin.email, admin.password)
    return ApiClient.forToken(tokens.access_token, 'admin (re-login)')
  }
}

export default async function globalTeardown() {
  const manifest = readRunManifest()
  if (!manifest?.backend || manifest.runId !== runId) return

  if (!destructiveCleanupAllowed) {
    console.log('[e2e] Cleanup skipped: set E2E_ALLOW_DESTRUCTIVE_CLEANUP=1 against a disposable backend to remove this run\'s test data.')
    return
  }
  if (!manifest.disposable) {
    console.warn('[e2e] Cleanup refused: the backend exposes no development capture routes, so it does not look disposable.')
    return
  }

  const admin = await adminClient()
  const personaClients: Partial<Record<PersonaKey, ApiClient>> = {}
  for (const key of Object.keys(manifest.personas) as PersonaKey[]) {
    personaClients[key] = key === 'admin' ? admin : ApiClient.forPersona(key)
  }

  const report = await cleanupRun({
    runId,
    surfaces: manifest.authConfig?.mounted_surfaces ?? [],
    admin,
    personaClients
  })
  console.log(`[e2e] Cleanup removed ${JSON.stringify(report.removed)}`)
  if (report.failures.length) {
    throw new Error(`[e2e] Cleanup failed for ${report.failures.length} record(s):\n  ${report.failures.join('\n  ')}`)
  }
}
