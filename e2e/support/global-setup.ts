import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { ApiClient } from './api-client'
import { prepareContext } from './app-config'
import { CAPTURE_KINDS, probeCapture } from './capabilities'
import {
  ACCESS_TOKEN_KEY,
  apiBaseUrl,
  apiUrl,
  appOrigin,
  baseURL,
  authStateDir,
  backendConfigured,
  destructiveCleanupAllowed,
  e2eTarget,
  releaseMode,
  REFRESH_TOKEN_KEY,
  runId,
  runManifestPath
} from './env'
import { isKnownPreset, isProvisionedPersona, PERSONA_KEYS, type PersonaKey, personaState, type Preset, PROVISIONED_PERSONAS, resolvePersona } from './personas'
import type { AuthConfig, CaptureKind, MintedPersona, RunManifest } from './run-manifest'
import { loginTokens, mintFreshSession, type SessionTokens, type StorageState, storageStateFor, tokenSecondsLeft } from './sessions'

// Runs once per `playwright test`, before any project:
//   1. preflight — the backend answers /auth/config (fails fast with a clear message);
//   2. optional reseed — E2E_RESEED_CMD (any shell command) resets the disposable backend;
//   3. personas — each available persona signs in ONCE through the API; the tokens are written
//      as that persona's storage state. Outside release mode a still-valid session from the
//      previous run against the same backend is reused instead (E2E_REUSE_SESSIONS=0 forces
//      fresh logins).
//      Provisioned personas (personas.ts) are created through the admin API every run;
//   4. run manifest — preset, capabilities, dev capture routes and minted personas, shared
//      with the workers via e2e/.auth/run.json.

const APP_CONFIG_FILE = fileURLToPath(new URL('../../public/app-config.json', import.meta.url))
const REUSE_MIN_SECONDS = 30 * 60

async function waitForBackend(timeoutMs: number): Promise<AuthConfig> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(apiUrl('/auth/config'))
      if (res.ok) return await res.json() as AuthConfig
      last = `HTTP ${res.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error(`[e2e] Backend not reachable at ${apiUrl('/auth/config')} within ${timeoutMs / 1000}s (${last}). `
    + 'Start the backend or fix E2E_API_BASE_URL / E2E_AUTH_API_PREFIX.')
}

function previousManifest(): RunManifest | null {
  if (!existsSync(runManifestPath)) return null
  try {
    return JSON.parse(readFileSync(runManifestPath, 'utf8')) as RunManifest
  } catch {
    return null
  }
}

function storedTokens(key: PersonaKey): SessionTokens | null {
  try {
    const state = JSON.parse(readFileSync(personaState(key), 'utf8')) as StorageState
    const items = state.origins.find(o => o.origin === appOrigin)?.localStorage ?? []
    const access = items.find(i => i.name === ACCESS_TOKEN_KEY)?.value
    const refresh = items.find(i => i.name === REFRESH_TOKEN_KEY)?.value
    return access && refresh ? { access_token: access, refresh_token: refresh } : null
  } catch {
    return null
  }
}

async function sessionUser(tokens: SessionTokens): Promise<{ id: string, email: string } | null> {
  const res = await fetch(apiUrl('/users/me'), { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  if (!res.ok) return null
  return await res.json() as { id: string, email: string }
}

// A provisioned persona: a fresh run-marked account (invite acceptance where the backend captures
// invites, else one password login) holding the named seed role directly. On EnterpriseRBAC it
// joins the admin persona's organization, so it is a global admin who still has a root entity.
async function provisionPersona(key: PersonaKey, admin: ApiClient, preset: Preset): Promise<{ tokens: SessionTokens, minted: MintedPersona }> {
  const spec = PROVISIONED_PERSONAS[key]!
  const adminMe = await admin.me()
  const organization = preset === 'EnterpriseRBAC' ? adminMe.root_entity_id ?? undefined : undefined
  const { user, tokens } = await mintFreshSession(admin, key, { invite: organization ? { entity_id: organization } : {} })
  const roles = await admin.listAll<{ id: string, name: string }>('/roles/')
  const role = roles.find(r => r.name === spec.roleName)
  if (!role) throw new Error(`[e2e] Cannot provision persona ${key}: the seed has no "${spec.roleName}" role.`)
  await admin.post(`/users/${user.id}/roles`, { role_id: role.id })
  return { tokens, minted: { email: user.email, userId: user.id, source: 'provisioned' } }
}

async function writeState(key: PersonaKey, tokens: SessionTokens | null) {
  await writeFile(personaState(key), JSON.stringify(storageStateFor(tokens), null, 2), 'utf8')
}

// The dev server compiles modules on first request, so the first wave of parallel tests can sit
// on the pre-mount splash past their timeouts. Boot the guest and the authenticated shell once
// before any test (dev target only; the static target serves prebuilt files).
async function warmUpDevServer(adminSignedIn: boolean) {
  const browser = await chromium.launch()
  try {
    const guest = await browser.newContext({ baseURL })
    await prepareContext(guest)
    const page = await guest.newPage()
    await page.goto('/auth/login')
    await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 120_000 })
    if (adminSignedIn) {
      const admin = await browser.newContext({ baseURL, storageState: personaState('admin') })
      await prepareContext(admin)
      const shell = await admin.newPage()
      await shell.goto('/app/dashboard')
      await shell.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 120_000 })
    }
  } finally {
    await browser.close()
  }
}

export default async function globalSetup() {
  await mkdir(authStateDir, { recursive: true })
  const previous = previousManifest()

  if (existsSync(APP_CONFIG_FILE)) {
    console.warn('[e2e] public/app-config.json exists. E2E ignores it (every context is served the harness config), '
      + (e2eTarget === 'static' ? 'but `nuxt generate` copies it into the artifact under test — remove it for a faithful static run.' : 'so it is safe to keep.'))
  }

  const manifest: RunManifest = {
    runId,
    startedAt: new Date().toISOString(),
    apiBaseUrl,
    appOrigin,
    backend: backendConfigured,
    preset: null,
    authConfig: null,
    capture: {},
    personas: {},
    disposable: false
  }

  if (!backendConfigured) {
    for (const key of PERSONA_KEYS) await writeState(key, null)
    await writeFile(runManifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    if (e2eTarget === 'dev' && process.env.E2E_WARMUP !== '0') await warmUpDevServer(false)
    console.log('[e2e] No E2E_API_BASE_URL: backend-gated specs skip; the backend-free smoke runs.')
    return
  }

  const timeoutMs = Number(process.env.E2E_BACKEND_TIMEOUT_MS ?? 30_000)
  let authConfig = await waitForBackend(timeoutMs)

  const reseedCmd = process.env.E2E_RESEED_CMD?.trim()
  if (reseedCmd) {
    console.log(`[e2e] Reseeding the backend: ${reseedCmd}`)
    execSync(reseedCmd, { stdio: 'inherit', shell: process.env.SHELL || '/bin/sh' })
    authConfig = await waitForBackend(timeoutMs)
  }

  if (authConfig.api_contract_version && authConfig.api_contract_version !== 'outlabs-auth.api/v1') {
    console.warn(`[e2e] Backend reports api_contract_version ${authConfig.api_contract_version}; the console targets outlabs-auth.api/v1.`)
  }
  const preset: Preset | null = isKnownPreset(authConfig.preset) ? authConfig.preset : null
  if (!preset) {
    console.warn(`[e2e] Unknown preset "${authConfig.preset}": personas come from E2E_<PERSONA>_EMAIL/PASSWORD only.`)
  }
  manifest.preset = preset
  manifest.authConfig = authConfig

  // Personas: one login per distinct account (SimpleRBAC's agent and writer share one).
  const reuseAllowed = !releaseMode && !reseedCmd && process.env.E2E_REUSE_SESSIONS !== '0'
    && previous?.apiBaseUrl === apiBaseUrl && previous?.appOrigin === appOrigin
  const requested = new Set((process.env.E2E_PERSONAS ?? '').split(',').map(s => s.trim()).filter(Boolean))
  const byEmail = new Map<string, { tokens: SessionTokens, minted: MintedPersona }>()
  const summary: string[] = []

  const provisionLater: PersonaKey[] = []
  for (const key of PERSONA_KEYS) {
    const resolved = resolvePersona(key, preset)
    if (!resolved.available || (requested.size && !requested.has(key))) {
      await writeState(key, null)
      continue
    }
    // No credentials of its own: created after the capture probe below (needs the admin).
    if (isProvisionedPersona(key) && !(resolved.email && resolved.password)) {
      await writeState(key, null)
      provisionLater.push(key)
      continue
    }
    const emailKey = resolved.email.toLowerCase()
    let session = byEmail.get(emailKey)

    if (!session && reuseAllowed && previous?.personas[key]?.email.toLowerCase() === emailKey) {
      const tokens = storedTokens(key)
      const secondsLeft = tokens ? tokenSecondsLeft(tokens.access_token) : null
      if (tokens && secondsLeft !== null && secondsLeft > REUSE_MIN_SECONDS) {
        const user = await sessionUser(tokens)
        if (user?.email.toLowerCase() === emailKey) {
          session = { tokens, minted: { email: user.email, userId: user.id, source: 'reused' } }
        }
      }
    }

    if (!session) {
      const tokens = await loginTokens(resolved.email, resolved.password)
      const user = await sessionUser(tokens)
      if (!user) throw new Error(`[e2e] Persona ${key} (${resolved.email}) signed in but GET /users/me failed.`)
      session = { tokens, minted: { email: user.email, userId: user.id, source: 'login' } }
    }

    byEmail.set(emailKey, session)
    manifest.personas[key] = session.minted
    await writeState(key, session.tokens)
    summary.push(`${key}=${session.minted.email} (${session.minted.source})`)
  }

  if (!manifest.personas.admin) {
    throw new Error('[e2e] No admin persona: set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD for this backend.')
  }

  // Dev capture routes, per kind (also the disposable-backend marker for cleanup).
  for (const kind of CAPTURE_KINDS) manifest.capture[kind as CaptureKind] = await probeCapture(kind as CaptureKind)
  manifest.disposable = Object.values(manifest.capture).some(Boolean)

  // Provisioned personas need the capture results (invite acceptance) through the manifest, and
  // only exist on a disposable backend whose cleanup removes them again.
  if (provisionLater.length && preset && manifest.disposable) {
    await writeFile(runManifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    const admin = ApiClient.forPersona('admin')
    for (const key of provisionLater) {
      const session = await provisionPersona(key, admin, preset)
      manifest.personas[key] = session.minted
      await writeState(key, session.tokens)
      summary.push(`${key}=${session.minted.email} (${session.minted.source})`)
    }
  }

  await writeFile(runManifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  if (e2eTarget === 'dev' && process.env.E2E_WARMUP !== '0') await warmUpDevServer(true)

  const cleanupMode = !destructiveCleanupAllowed
    ? 'off (E2E_ALLOW_DESTRUCTIVE_CLEANUP!=1)'
    : !manifest.disposable
        ? 'refused (backend exposes no dev capture routes)'
        : 'this run\'s run-marked test data'
  console.log(`[e2e] run ${runId} · ${preset ?? authConfig.preset} at ${apiBaseUrl} · target ${e2eTarget} · personas ${summary.join(', ')} · cleanup ${cleanupMode}`)
}
