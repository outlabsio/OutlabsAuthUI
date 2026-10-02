import { fileURLToPath } from 'node:url'

// The one place the E2E harness reads its environment. Specs and support modules import
// targets from here instead of re-reading process.env with their own defaults.
//
// E2E_API_BASE_URL is THE switch for which backend a run targets: unset → backend-gated specs
// skip and only the backend-free smoke runs; set → the preset is detected from /auth/config
// and persona credentials default to that preset's seed (see personas.ts).

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

export type E2ETarget = 'dev' | 'static'

// Release mode: E2E_RELEASE=1, which `bun run release:check` sets (CI=1 is kept as an alias).
// One retry, a test that passes only on retry fails the run, `.only` fails the run, Playwright's
// default worker count, every persona signs in fresh and no running server is reused.
export const releaseMode = process.env.E2E_RELEASE === '1' || Boolean(process.env.CI)

// Optional report folder (the release check sets one per preset): the HTML report, a JSON
// results file and the failure artifacts go there instead of playwright-report/ and test-results/.
export const reportDir = process.env.E2E_REPORT_DIR?.trim() || ''

// Where the console under test is served (Playwright's webServer boots it on this port).
export const appPort = Number(process.env.E2E_PORT ?? 3000)
export const baseURL = trimTrailingSlash(process.env.E2E_BASE_URL ?? `http://localhost:${appPort}`)
export const appOrigin = new URL(baseURL).origin

// `dev` = the Nuxt dev server (fast inner loop). `static` = `nuxt generate` served with the
// generated _headers by scripts/serve-static.mjs, i.e. the artifact that ships (what the release
// check runs).
export const e2eTarget: E2ETarget = process.env.E2E_TARGET === 'static' ? 'static' : 'dev'

// The disposable outlabsAuth backend.
export const backendConfigured = Boolean(process.env.E2E_API_BASE_URL?.trim())
export const apiBaseUrl = trimTrailingSlash(process.env.E2E_API_BASE_URL?.trim() || 'http://localhost:8004')
export const apiOrigin = new URL(apiBaseUrl).origin
export const authApiPrefix = ensureLeadingSlash(process.env.E2E_AUTH_API_PREFIX ?? '/v1')
export const authApiBase = `${apiBaseUrl}${authApiPrefix}`

// URL of an auth-library route (mounted under the prefix), e.g. apiUrl('/users/').
export function apiUrl(path: string): string {
  return `${authApiBase}${ensureLeadingSlash(path)}`
}

// URL of an app-root route on the backend (not under the prefix), e.g. the dev capture routes.
export function backendUrl(path: string): string {
  return `${apiBaseUrl}${ensureLeadingSlash(path)}`
}

// One id per `playwright test` invocation. Set once in the runner process (config load) and
// inherited by every worker, so test data created anywhere in the run carries the same marker.
function newRunId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
process.env.E2E_RUN_ID ||= newRunId()
export const runId = process.env.E2E_RUN_ID.toLowerCase().replace(/[^a-z0-9]/g, '')

// Destructive cleanup is opt-in: only when the operator (or the release check) declares the
// backend disposable.
export const destructiveCleanupAllowed = process.env.E2E_ALLOW_DESTRUCTIVE_CLEANUP === '1'

// Harness state (persona storage states + the run manifest). Gitignored.
export const authStateDir = fileURLToPath(new URL('../.auth/', import.meta.url))
export const runManifestPath = `${authStateDir}run.json`

// localStorage keys the console keeps its tokens under (app/auth/tokens.ts).
export const ACCESS_TOKEN_KEY = 'outlabs-auth.access-token'
export const REFRESH_TOKEN_KEY = 'outlabs-auth.refresh-token'
