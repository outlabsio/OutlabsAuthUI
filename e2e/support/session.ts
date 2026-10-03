import type { Browser, BrowserContext, Page, Route, TestInfo } from '@playwright/test'
import { adminAccessToken } from './admin-token'
import { runId } from './env'
import { loginWithinLimiter } from './login-limiter'
import { testData } from './test-data'

// Helpers for the session-lifecycle specs. These specs sign in, rotate and revoke real
// sessions, so they never touch the shared admin storage-state session: each test mints its
// own disposable, run-marked user through the admin API and signs that user in (API or UI).

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'
export const apiBase = `${apiBaseUrl}${authApiPrefix}`

export const TEST_PASSWORD = 'Testpass1!'

export type Tokens = { accessToken: string, refreshToken: string }
export type TestUser = { id: string, email: string }

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number, data: T }> {
  const { token, headers, ...rest } = init
  const response = await fetch(`${apiBase}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  })
  const text = await response.text()
  return { status: response.status, data: (text ? JSON.parse(text) : null) as T }
}

// Run-marked, so the run's cleanup removes these users.
const runData = testData(runId)

export async function createTestUser(label: string, { superuser = false } = {}): Promise<TestUser> {
  const email = runData.email(`session-${label}`)
  const created = await api<{ id?: string }>('/users/', {
    method: 'POST',
    token: adminAccessToken(),
    body: JSON.stringify({ email, password: TEST_PASSWORD, is_superuser: superuser })
  })
  if (created.status !== 201 || !created.data?.id) throw new Error(`create test user failed: ${created.status}`)
  return { id: created.data.id, email }
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return
  await api(`/users/${user.id}`, { method: 'DELETE', token: adminAccessToken() }).catch(() => undefined)
}

// One password login through the API (counts against the backend's login limiter).
// A refusal by the login limiter is waited out (support/login-limiter.ts).
export async function apiLogin(email: string, password = TEST_PASSWORD): Promise<Tokens> {
  const res = await loginWithinLimiter(() => fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }))
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  const data = await res.json() as { access_token: string, refresh_token: string }
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

// A user's live server-side sessions, read with the shared admin token.
export async function listUserSessions(user: TestUser): Promise<Array<{ id: string }>> {
  const res = await api<Array<{ id: string }>>(`/users/${user.id}/sessions`, { token: adminAccessToken() })
  if (res.status !== 200) throw new Error(`list sessions failed: ${res.status}`)
  return res.data
}

// The example backends expose a dev-only capture of issued invite tokens on EnterpriseRBAC.
let inviteCapture: boolean | undefined
async function inviteCaptureAvailable(): Promise<boolean> {
  if (inviteCapture !== undefined) return inviteCapture
  const res = await fetch(`${apiBaseUrl}/dev/auth/invite/latest?email=${encodeURIComponent('nobody@example.com')}`).catch(() => null)
  const body = res ? await res.json().catch(() => null) as { error?: string } | null : null
  inviteCapture = Boolean(res?.ok || body?.error === 'HTTP_ERROR')
  return inviteCapture
}

/**
 * A disposable user with a fresh session (password TEST_PASSWORD). Where the backend exposes
 * the dev invite capture, the session comes from accepting an invite, which leaves the
 * backend's per-IP password-login limiter untouched; otherwise the user is created with a
 * password and signs in once through the API.
 */
export async function createSignedInUser(label: string, { superuser = false } = {}): Promise<{ user: TestUser, tokens: Tokens }> {
  if (!(await inviteCaptureAvailable())) {
    const user = await createTestUser(label, { superuser })
    return { user, tokens: await apiLogin(user.email) }
  }
  const email = runData.email(`session-${label}`)
  const invited = await api<{ id?: string }>('/auth/invite', {
    method: 'POST',
    token: adminAccessToken(),
    body: JSON.stringify({ email, is_superuser: superuser })
  })
  if (invited.status !== 201 || !invited.data?.id) throw new Error(`invite failed: ${invited.status}`)
  const capture = await fetch(`${apiBaseUrl}/dev/auth/invite/latest?email=${encodeURIComponent(email)}`)
  const { token } = await capture.json() as { token: string }
  const accepted = await api<{ access_token: string, refresh_token: string }>('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: TEST_PASSWORD })
  })
  if (accepted.status !== 200) throw new Error(`accept invite failed: ${accepted.status}`)
  return {
    user: { id: invited.data.id, email },
    tokens: { accessToken: accepted.data.access_token, refreshToken: accepted.data.refresh_token }
  }
}

// The same JWT with its expiry moved into the past. The signature no longer matches, so the
// API refuses it exactly as it refuses an expired token; the subject is kept so other tabs
// still recognise the identity.
export function expiredVariant(accessToken: string): string {
  const [header, payload] = accessToken.split('.')
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<string, unknown>
  claims.exp = Math.floor(Date.now() / 1000) - 60
  return `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.expired-signature`
}

// Contexts created here start signed out (the project's admin storage state is overridden).
export async function newSessionContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const baseURL = testInfo.project.use.baseURL
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  // Same app-config baseline as the page fixture (independent of any local app-config.json).
  await context.route('**/app-config.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ apiBaseUrl, authApiPrefix, authUi: { signup: true, oauthProviders: [], magicLink: true } })
  }))
  return context
}

// Writes tokens into the origin's localStorage without booting the app first (a static
// document on the console origin is enough to reach its storage).
export async function storeTokens(page: Page, tokens: Tokens) {
  await page.goto('/brand/outlabs-auth-logo.svg')
  await page.evaluate(({ accessToken, refreshToken }) => {
    localStorage.setItem('outlabs-auth.access-token', accessToken)
    localStorage.setItem('outlabs-auth.refresh-token', refreshToken)
  }, tokens)
}

// A URL predicate on the path alone: a regex like /\/app\/users$/ would also match
// /auth/login?redirect=/app/users.
export const onPath = (path: string) => (url: URL) => url.pathname === path

export async function readStoredTokens(page: Page): Promise<Partial<Tokens>> {
  return page.evaluate(() => ({
    accessToken: localStorage.getItem('outlabs-auth.access-token') ?? undefined,
    refreshToken: localStorage.getItem('outlabs-auth.refresh-token') ?? undefined
  }))
}

// CORS headers for mocked API responses, derived from the console origin under test.
export function corsHeaders(testInfo: TestInfo): Record<string, string> {
  const origin = new URL(String(testInfo.project.use.baseURL)).origin
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type'
  }
}

export function fulfillJson(route: Route, testInfo: TestInfo, status: number, body: unknown) {
  const headers = corsHeaders(testInfo)
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
  return route.fulfill({ status, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
