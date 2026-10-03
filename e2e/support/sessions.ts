import type { Page } from '@playwright/test'
import { type ApiClient, type ApiUser, TEST_PASSWORD } from './api-client'
import { captureAvailable } from './capabilities'
import { ACCESS_TOKEN_KEY, appOrigin, apiUrl, backendUrl, REFRESH_TOKEN_KEY } from './env'
import { loginWithinLimiter } from './login-limiter'

// Session minting and client-side expiry simulation.
//
// Sessions come from ONE password login through the API (never the UI), written as a
// Playwright storage state with the tokens in localStorage — exactly what the console stores.
// The backend's password-login limiter is small (the example apps allow 20 per 5 minutes per
// IP), so every login here is deliberate: personas are minted once per run in globalSetup,
// and only tests that must own a session (the session-lifecycle lane) log in themselves. A login
// the limiter refuses waits until it is admitted (support/login-limiter.ts).

export type SessionTokens = { access_token: string, refresh_token: string }

export type StorageState = {
  cookies: never[]
  origins: Array<{ origin: string, localStorage: Array<{ name: string, value: string }> }>
}

export class LoginError extends Error {
  constructor(readonly email: string, readonly status: number, readonly detail: string, readonly retryAfterSeconds?: number) {
    super(status === 429
      ? `Password login for ${email} was rate-limited (429); the backend login limiter resets in ~${retryAfterSeconds ?? '?'}s. `
      + 'Wait it out, reset the limiter on your disposable backend, or reuse cached sessions (E2E_REUSE_SESSIONS).'
      : `Password login for ${email} failed (${status}): ${detail}. If the seed changed, reseed the backend (E2E_RESEED_CMD).`)
    this.name = 'LoginError'
  }
}

// `userAgent` is recorded on the session, so a test can tell its rows apart ("Firefox 130 on
// Windows").
export async function loginTokens(email: string, password: string, { userAgent }: { userAgent?: string } = {}): Promise<SessionTokens> {
  const res = await loginWithinLimiter(() => fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(userAgent ? { 'User-Agent': userAgent } : {}) },
    body: JSON.stringify({ email, password })
  }))
  const text = await res.text()
  let data: Record<string, unknown> | null
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    data = null
  }
  if (!res.ok) {
    const details = (data?.details ?? {}) as { retry_after_seconds?: number }
    throw new LoginError(email, res.status, String(data?.message ?? data?.detail ?? text), details.retry_after_seconds)
  }
  return data as unknown as SessionTokens
}

export function storageStateFor(tokens: SessionTokens | null): StorageState {
  return {
    cookies: [],
    origins: tokens
      ? [{
          origin: appOrigin,
          localStorage: [
            { name: ACCESS_TOKEN_KEY, value: tokens.access_token },
            { name: REFRESH_TOKEN_KEY, value: tokens.refresh_token }
          ]
        }]
      : []
  }
}

// A fresh run-marked user with a session the test owns and may expire, rotate or revoke (never
// do that to a shared persona session). Where the backend exposes the dev invite capture, the
// session comes from accepting an invite, which leaves the per-IP password-login limiter
// untouched; otherwise the user is created with TEST_PASSWORD and signs in once through the API.
// `named: false` leaves the account without a first or last name (an invited account that never
// set one).
export async function mintFreshSession(
  api: ApiClient,
  kind = 'session',
  { named = true, invite = {} }: { named?: boolean, invite?: Record<string, unknown> } = {}
): Promise<{ user: ApiUser, tokens: SessionTokens }> {
  const names = named ? { first_name: 'E2E', last_name: kind } : { first_name: null, last_name: null }
  if (await captureAvailable('invite')) {
    const email = api.data.email(kind)
    // `invite` adds InviteUserRequest fields (e.g. entity_id); a password-created user ignores them.
    const user = await api.post<ApiUser>('/auth/invite', { email, ...(named ? names : {}), ...invite })
    const res = await fetch(`${backendUrl('/dev/auth/invite/latest')}?${new URLSearchParams({ email })}`)
    const token = res.ok ? ((await res.json()) as { token?: string }).token : undefined
    if (!token) throw new Error(`No invite token captured for ${email} (${res.status}).`)
    const accepted = await fetch(apiUrl('/auth/accept-invite'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: TEST_PASSWORD })
    })
    if (!accepted.ok) throw new Error(`Accepting the invite for ${email} failed (${accepted.status}): ${await accepted.text()}`)
    const tokens = await accepted.json() as SessionTokens
    return { user: { ...user, email }, tokens }
  }
  const user = await api.createUser({ kind, ...(names as Partial<ApiUser>) })
  return { user, tokens: await loginTokens(user.email, TEST_PASSWORD) }
}

// Another session of an existing user, as a second device would sign in. Where the backend
// exposes the dev magic-link capture, it comes from a magic link (no password login, so the
// per-IP login limiter is untouched); otherwise from one API password login. `userAgent` is
// recorded on the new session (both ways), so its row is identifiable in a sessions table.
export async function mintAnotherSession(user: { email: string }, password = TEST_PASSWORD, { userAgent }: { userAgent?: string } = {}): Promise<SessionTokens> {
  const agent: Record<string, string> = userAgent ? { 'User-Agent': userAgent } : {}
  if (await captureAvailable('magic-link')) {
    const requested = await fetch(apiUrl('/auth/magic-link/request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email })
    })
    const res = requested.ok ? await fetch(`${backendUrl('/dev/auth/magic-link/latest')}?${new URLSearchParams({ email: user.email })}`) : null
    const token = res?.ok ? ((await res.json()) as { token?: string }).token : undefined
    if (token) {
      const verified = await fetch(apiUrl('/auth/magic-link/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...agent },
        body: JSON.stringify({ token })
      })
      if (verified.ok) return await verified.json() as SessionTokens
    }
  }
  return loginTokens(user.email, password, { userAgent })
}

export async function readSessionTokens(page: Page): Promise<{ access: string | null, refresh: string | null }> {
  return page.evaluate(([accessKey, refreshKey]) => ({
    access: localStorage.getItem(accessKey!),
    refresh: localStorage.getItem(refreshKey!)
  }), [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY])
}

// Simulate an idle tab whose access token has expired, without a short-TTL backend: rewrite the
// stored JWT's `exp` into the past. The signature no longer matches, so the backend answers the
// next request with a real 401 and the console must run its real refresh against the real
// backend (a 1-minute-TTL backend exercises the same path; see e2e/README.md).
export async function expireAccessToken(page: Page): Promise<void> {
  await page.evaluate((accessKey) => {
    const token = localStorage.getItem(accessKey)
    if (!token) throw new Error('expireAccessToken: no access token in localStorage')
    const [header, payload, signature] = token.split('.')
    const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const claims = decode(payload!) as Record<string, unknown>
    claims.exp = Math.floor(Date.now() / 1000) - 60
    localStorage.setItem(accessKey, `${header}.${encode(claims)}.${signature}`)
  }, ACCESS_TOKEN_KEY)
}

// Server-side probes for a token the test captured. They call the API from the test runner
// (not the browser), so they bypass the console and its error guard. Use them to prove a
// session is really over, e.g. after a password change or "sign out everywhere".
//
// HTTP status of POST /auth/refresh with this refresh token (200 = the session is alive).
// Never probe a token the console has already ROTATED: presenting a rotated token is refresh
// reuse, and the backend answers it by revoking every session of that user.
export async function refreshTokenStatus(refreshToken: string): Promise<number> {
  const res = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  await res.body?.cancel()
  return res.status
}

// HTTP status of GET /users/me with this access token (200 = the backend still accepts it).
export async function accessTokenStatus(accessToken: string): Promise<number> {
  const res = await fetch(apiUrl('/users/me'), { headers: { Authorization: `Bearer ${accessToken}` } })
  await res.body?.cancel()
  return res.status
}

// Seconds until a JWT expires (negative when expired; null when unreadable).
export function tokenSecondsLeft(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp - Math.floor(Date.now() / 1000) : null
  } catch {
    return null
  }
}
