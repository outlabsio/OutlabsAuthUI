import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'
import { prepareContext } from './app-config'
import { apiUrl, authApiBase, backendConfigured, backendUrl } from './env'
import { loginWithinLimiter } from './login-limiter'
import { type PersonaKey, persona, personaOverrides, type Preset } from './personas'
import { type AuthConfig, type CaptureKind, readRunManifest } from './run-manifest'

// Capability discovery for preset-aware specs. The backend's /auth/config is the source of
// truth (preset, features, auth_methods, mounted_surfaces); globalSetup records it in the run
// manifest so workers read it without another request.

export type { AuthConfig, CaptureKind }

let fetchedConfig: AuthConfig | null | undefined

export async function backendCapabilities(): Promise<AuthConfig | null> {
  if (!backendConfigured) return null
  const manifest = readRunManifest()
  if (manifest?.authConfig) return manifest.authConfig
  if (fetchedConfig !== undefined) return fetchedConfig
  try {
    const res = await fetch(apiUrl('/auth/config'))
    fetchedConfig = res.ok ? (await res.json()) as AuthConfig : null
  } catch {
    fetchedConfig = null
  }
  return fetchedConfig
}

export type AuthMethod = 'password' | 'magic_link' | 'access_code'

export async function authMethodOn(name: AuthMethod): Promise<boolean> {
  const caps = await backendCapabilities()
  return Boolean(caps?.auth_methods?.[name])
}

// The example apps' development capture routes (app root, not under the auth prefix). They
// answer 404 with a "has been requested/issued" message when enabled but empty, and a bare
// 404 when the route is not mounted or its debug flag is off. Probed per kind: SimpleRBAC,
// for example, only exposes reset-password.
export const CAPTURE_KINDS: CaptureKind[] = ['access-code', 'magic-link', 'invite', 'reset-password', 'phone-verify']

export async function probeCapture(kind: CaptureKind): Promise<boolean> {
  try {
    const res = await fetch(backendUrl(`/dev/auth/${kind}/latest?email=probe%40example.com`))
    if (res.ok) return true
    const body = await res.text()
    return /has been (requested|issued)/i.test(body)
  } catch {
    return false
  }
}

const captureCache = new Map<CaptureKind, boolean>()

export async function captureAvailable(kind: CaptureKind): Promise<boolean> {
  if (!backendConfigured) return false
  const recorded = readRunManifest()?.capture[kind]
  if (recorded !== undefined) return recorded
  if (!captureCache.has(kind)) captureCache.set(kind, await probeCapture(kind))
  return captureCache.get(kind)!
}

export type Requirement = {
  // Defaults to true: every requirement implies a configured backend.
  backend?: boolean
  preset?: Preset | Preset[]
  features?: string[]
  surfaces?: string[]
  authMethods?: AuthMethod[]
  capture?: CaptureKind[]
  personas?: PersonaKey[]
}

// Why the requirement is unmet (a skip reason), or null when it is met.
export async function unmetRequirement(req: Requirement = {}): Promise<string | null> {
  if (req.backend !== false && !backendConfigured) return 'No E2E backend configured (set E2E_API_BASE_URL).'
  if (!backendConfigured) return null
  const caps = await backendCapabilities()
  if (!caps) return 'Backend /auth/config is unreachable.'

  const presets = req.preset ? [req.preset].flat() : []
  if (presets.length && !presets.includes(caps.preset as Preset)) {
    return `Needs ${presets.join(' or ')}; backend preset is ${caps.preset ?? 'unknown'}.`
  }
  const missingFeatures = (req.features ?? []).filter(f => !caps.features?.[f])
  if (missingFeatures.length) return `Backend feature(s) off: ${missingFeatures.join(', ')}.`
  const mounted = new Set(caps.mounted_surfaces ?? [])
  const missingSurfaces = (req.surfaces ?? []).filter(s => !mounted.has(s))
  if (missingSurfaces.length) return `Backend surface(s) not mounted: ${missingSurfaces.join(', ')}.`
  const missingMethods = (req.authMethods ?? []).filter(m => !caps.auth_methods?.[m])
  if (missingMethods.length) return `Auth method(s) off: ${missingMethods.join(', ')}.`
  for (const kind of req.capture ?? []) {
    if (!(await captureAvailable(kind))) return `Dev capture route for ${kind} is not enabled.`
  }
  const missingPersonas = (req.personas ?? []).filter(key => !persona(key).available)
  if (missingPersonas.length) return `Persona(s) not available on this backend: ${missingPersonas.join(', ')}.`
  return null
}

// Skip the current test (or hook's group) unless the backend meets the requirement.
// Usage: `await requireBackend({ surfaces: ['entities'], personas: ['orgAdmin'] })`.
export async function requireBackend(req: Requirement = {}): Promise<void> {
  const reason = await unmetRequirement(req)
  test.info().skip(reason !== null, reason ?? undefined)
}

// ── Reference-seed facts ──
// Records the reference seeds guarantee (outlabsAuth examples/*_rbac/reset_test_env.py): the
// org admin's and the admin's organization, both organizations, the inactive office, the
// west_coast_after_hours role, the system permissions. On the reference seeds a missing fact
// fails the test: a regression such as GET /users/me losing root_entity_id must not turn the
// delegated-admin specs into green skips. With persona overrides (E2E_<PERSONA>_EMAIL /
// _PASSWORD: another backend's accounts) or an unknown preset the fact is not guaranteed, so the
// test skips and the report names the fact and the overrides.
// Usage: `expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')`.
export function expectSeeded<T>(value: T, fact: string): asserts value is NonNullable<T> {
  if (value) return
  const overrides = personaOverrides()
  const preset = readRunManifest()?.preset ?? null
  if (overrides.length || !preset) {
    const why = overrides.length ? `persona overrides (${overrides.join(', ')})` : 'an unknown preset'
    test.info().skip(true, `Not on the reference seed (${why}), and it lacks: ${fact}.`)
  }
  expect(value, `Reference seed: ${fact}`).toBeTruthy()
  throw new Error(`Reference seed: ${fact}`)
}

// ── Authorization-spec helpers ──
// Preset/surface awareness for authorization specs. The suite runs against whichever backend
// E2E_API_BASE_URL points at (EnterpriseRBAC or SimpleRBAC); specs read the live /auth/config
// so they assert the UI the backend should produce instead of hardcoding one preset.

export const apiRoot = authApiBase

export type LiveAuthConfig = {
  preset: string
  api_contract_version?: string
  library_version?: string
  features: Record<string, boolean>
  auth_methods?: Record<string, boolean>
  mounted_surfaces?: string[]
}

// The live /auth/config (recorded by globalSetup in the run manifest), typed for these helpers.
export async function liveAuthConfig(): Promise<LiveAuthConfig | null> {
  return (await backendCapabilities()) as LiveAuthConfig | null
}

export async function backendHasSurface(surface: string): Promise<boolean> {
  const config = await liveAuthConfig()
  if (!config) return false
  return !Array.isArray(config.mounted_surfaces) || config.mounted_surfaces.includes(surface)
}

// Mirrors the console's isEnterprise: hierarchy feature AND the entities router.
export async function isEnterpriseBackend(): Promise<boolean> {
  const config = await liveAuthConfig()
  return Boolean(config?.features?.entity_hierarchy) && await backendHasSurface('entities')
}

// A minimal config used when no backend is reachable (guest render smoke).
const FALLBACK_CONFIG: LiveAuthConfig = {
  preset: 'SimpleRBAC',
  api_contract_version: 'outlabs-auth.api/v1',
  features: { entity_hierarchy: false, api_keys: true, activity_tracking: true, invitations: true },
  mounted_surfaces: ['auth', 'users', 'roles', 'permissions', 'api_keys']
}

// Serve /auth/config with a patch applied (extra mounted surfaces, another contract version...).
// The base is the live backend's answer when reachable (fulfilled with its own CORS headers),
// else FALLBACK_CONFIG, so specs work with and without a backend. Playwright adds the CORS
// headers for fulfilled cross-origin responses that don't set their own.
export async function patchAuthConfig(page: Page, patch: (config: LiveAuthConfig) => LiveAuthConfig) {
  await page.route('**/auth/config', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
    try {
      const response = await route.fetch()
      if (response.ok()) return route.fulfill({ response, json: patch(await response.json() as LiveAuthConfig) })
    } catch {
      // No backend — use the fallback.
    }
    return route.fulfill({ status: 200, json: patch(FALLBACK_CONFIG) })
  })
}

export async function withExtraSurfaces(page: Page, surfaces: string[]) {
  await patchAuthConfig(page, config => ({
    ...config,
    mounted_surfaces: [...new Set([...(config.mounted_surfaces ?? []), ...surfaces])]
  }))
}

export async function withoutSurfaces(page: Page, surfaces: string[]) {
  await patchAuthConfig(page, config => ({
    ...config,
    mounted_surfaces: (config.mounted_surfaces ?? []).filter(s => !surfaces.includes(s))
  }))
}

// ── Extra personas (API login, no UI) ──
// Specs that need an isolated session for a persona (one whose refresh rotation must not touch
// the shared minted storage state) log it in ONCE through the API and seed its tokens into a
// fresh context (the login limiter is IP-bucketed, so never log in per test; a refusal is waited
// out once, support/login-limiter.ts).

export type PersonaTokens = { accessToken: string, refreshToken: string }

export async function apiLogin(email: string, password: string): Promise<PersonaTokens> {
  const res = await loginWithinLimiter(() => fetch(`${apiRoot}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  }))
  if (!res.ok) throw new Error(`API login failed for ${email}: ${res.status} ${await res.text()}`)
  const body = await res.json() as { access_token: string, refresh_token: string }
  return { accessToken: body.access_token, refreshToken: body.refresh_token }
}

// A browser context signed in as the persona. Tokens are written only when absent so a
// refresh rotation during the test is never overwritten by the original pair.
export async function personaContext(browser: Browser, tokens: PersonaTokens, baseURL?: string): Promise<BrowserContext> {
  // Playwright applies the project's `use` options to manual contexts too, so explicitly start
  // from an empty storage state (the project default is the admin session).
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  // Same operator-independent runtime config the shared `page` fixture serves.
  await prepareContext(context)
  await context.addInitScript(({ accessToken, refreshToken }) => {
    if (!window.localStorage.getItem('outlabs-auth.access-token')) {
      window.localStorage.setItem('outlabs-auth.access-token', accessToken)
      window.localStorage.setItem('outlabs-auth.refresh-token', refreshToken)
    }
  }, tokens)
  return context
}

export async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${apiRoot}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return await res.json() as T
}

// The sidebar's links, in order (both navigation menus).
export async function sidebarLinks(page: Page): Promise<{ name: string, href: string }[]> {
  const links = page.getByRole('navigation').getByRole('link')
  await links.first().waitFor()
  return await links.evaluateAll(nodes => nodes.map(n => ({
    name: (n.textContent ?? '').trim(),
    href: n.getAttribute('href') ?? ''
  })))
}

// The UEmpty states AppPermissionGate renders instead of content.
export const DENIED_TITLE = /^No access to /
export const GATE_STATE_TITLES = /^(No access to |Not available on this server|Server capabilities unavailable)/
