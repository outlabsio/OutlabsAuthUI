// Test-only capture of passwordless tokens/codes. The outlabsAuth example apps expose
// dev-mode debug endpoints (app root, NOT under the auth prefix) that return the latest
// token/code emailed to an address — so E2E can exercise the *verify* side of the flows
// end-to-end without reading real email. Gated by ACCESS_CODE_DEBUG_CODES /
// MAGIC_LINK_DEBUG_TOKENS / INVITE_DEBUG_TOKENS on the backend (on by default in dev).

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authBase = `${apiBaseUrl}${process.env.E2E_AUTH_API_PREFIX ?? '/v1'}`

async function capture(path: string, email: string, field: 'code' | 'token'): Promise<string | null> {
  const res = await fetch(`${apiBaseUrl}${path}?email=${encodeURIComponent(email)}`)
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const value = data?.[field]
  return typeof value === 'string' ? value : null
}

export const captureAccessCode = (email: string) =>
  capture('/dev/auth/access-code/latest', email, 'code')

export const captureMagicLinkToken = (email: string) =>
  capture('/dev/auth/magic-link/latest', email, 'token')

export const captureInviteToken = (email: string) =>
  capture('/dev/auth/invite/latest', email, 'token')

export const captureResetToken = (email: string) =>
  capture('/dev/auth/reset-password/latest', email, 'token')

// Admin-side helpers so the invite E2E can send an invite through the API (the invite send
// requires an authenticated superuser; the accept side is then driven through the UI).
export async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${authBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null
  return data?.access_token ?? ''
}

export async function apiInvite(accessToken: string, email: string): Promise<void> {
  await fetch(`${authBase}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ email })
  })
}

// Probe whether the dev capture endpoints are enabled (404 with no request means enabled
// but empty; a hard 404 for the route means disabled — treat both as "try it").
export async function captureEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/dev/auth/access-code/latest?email=probe@example.com`)
    const body = await res.text()
    // Route present (even 404 "no code") returns our detail text, not FastAPI's default.
    return res.ok || body.includes('has been requested')
  } catch {
    return false
  }
}
