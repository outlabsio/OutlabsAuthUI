// Test-only capture of passwordless tokens/codes. The outlabsAuth example apps expose
// dev-mode debug endpoints (app root, NOT under the auth prefix) that return the latest
// token/code emailed to an address — so E2E can exercise the *verify* side of the flows
// end-to-end without reading real email. Gated by ACCESS_CODE_DEBUG_CODES /
// MAGIC_LINK_DEBUG_TOKENS / INVITE_DEBUG_TOKENS on the backend (on by default in dev).
// Which kinds a backend exposes is probed per kind (`captureAvailable` in capabilities.ts).
import { captureAvailable, type CaptureKind } from './capabilities'
import { authApiBase, backendUrl } from './env'
import { personaByEmail, personaToken } from './personas'
import { loginTokens } from './sessions'

async function capture(path: string, params: Record<string, string>, field: 'code' | 'token'): Promise<string | null> {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`${backendUrl(path)}?${query}`)
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const value = data?.[field]
  return typeof value === 'string' ? value : null
}

export const captureAccessCode = (email: string) =>
  capture('/dev/auth/access-code/latest', { email }, 'code')

export const captureAccessCodeByPhone = (phone: string) =>
  capture('/dev/auth/access-code/latest', { phone }, 'code')

export const captureMagicLinkToken = (email: string) =>
  capture('/dev/auth/magic-link/latest', { email }, 'token')

export const captureInviteToken = (email: string) =>
  capture('/dev/auth/invite/latest', { email }, 'token')

export const captureResetToken = (email: string) =>
  capture('/dev/auth/reset-password/latest', { email }, 'token')

export const capturePhoneVerifyCode = (email: string) =>
  capture('/dev/auth/phone-verify/latest', { email }, 'code')

// Admin-side helpers so the invite E2E can send an invite through the API (the invite send
// requires an authenticated superuser; the accept side is then driven through the UI).
//
// A persona's email resolves to the session globalSetup already minted — no login. Any other
// account (a fresh user a test just created) logs in once per worker and is cached: the
// backend's password-login limiter is small and shared by the whole run.
const tokenCache = new Map<string, string>()

export async function apiLogin(email: string, password: string): Promise<string> {
  const persona = personaByEmail(email)
  if (persona) return personaToken(persona)
  const cached = tokenCache.get(email)
  if (cached) return cached
  try {
    const token = (await loginTokens(email, password)).access_token
    tokenCache.set(email, token)
    return token
  } catch {
    return ''
  }
}

export async function apiInvite(accessToken: string, email: string): Promise<void> {
  await fetch(`${authApiBase}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ email })
  })
}

// Admin creates an active user with a password (UserCreateRequest) — fresh per run so the
// phone-verify rate limits never collide across runs. Returns the new user's id ('' on failure).
export async function apiCreateUser(accessToken: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${authApiBase}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ email, password, first_name: 'E2E', last_name: 'Phone' })
  })
  if (!res.ok) return ''
  const data = (await res.json().catch(() => null)) as { id?: string } | null
  return data?.id ?? ''
}

// Admin lookups for lifecycle tests (gap-backlog #2).
export async function apiFindUserId(accessToken: string, email: string): Promise<string> {
  const res = await fetch(`${authApiBase}/users/?search=${encodeURIComponent(email)}&limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = (await res.json().catch(() => null)) as { items?: Array<{ id?: string }> } | null
  return data?.items?.[0]?.id ?? ''
}

// Self-service phone loop (F2/F3 path): set an E.164 number, request + confirm the
// verification code, after which the number can sign in by OTP.
export async function apiSetMyPhone(accessToken: string, phone: string): Promise<boolean> {
  const res = await fetch(`${authApiBase}/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ phone })
  })
  return res.ok
}

export async function apiRequestPhoneVerify(accessToken: string): Promise<boolean> {
  const res = await fetch(`${authApiBase}/users/me/phone/request-code`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  return res.ok || res.status === 204
}

export async function apiConfirmPhoneVerify(accessToken: string, code: string): Promise<boolean> {
  const res = await fetch(`${authApiBase}/users/me/phone/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ code })
  })
  return res.ok
}

// Whether the backend exposes the dev capture route for `kind` (default: access codes, the
// historical probe). Prefer `requires({ capture: ['reset-password'] })` in new specs.
export function captureEnabled(kind: CaptureKind = 'access-code'): Promise<boolean> {
  return captureAvailable(kind)
}
