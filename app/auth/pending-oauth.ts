import { rememberPostSignInRedirect } from '~/auth/post-sign-in-redirect'

// Login-CSRF guard for the OAuth callback. The provider hands the session back in the URL
// fragment of /auth/oauth/callback, and anyone can link to that page with a token pair of their
// own. So the callback only accepts a session in a tab that just left for a provider: the
// sign-in and signup pages write a one-time marker (a random nonce and the time) to
// sessionStorage right before the redirect, and the callback consumes it before any request.
// sessionStorage belongs to this tab and this origin, so no other site or tab can plant it.
// Linking a provider from Account returns no tokens and sets no marker.

const storageKey = 'outlabs-auth.pending-oauth'

// Long enough for the provider's own sign-in, MFA and consent screens; short enough that an
// abandoned attempt does not leave the tab accepting a callback for long.
export const PENDING_OAUTH_TTL_MS = 20 * 60 * 1000
// A marker dated in the future is refused beyond this much clock drift.
const CLOCK_SKEW_MS = 60_000

export type PendingOAuth = { nonce: string, startedAt: number }

/** Validates a stored marker; null when missing, malformed, expired or dated in the future. */
export function parsePendingOAuth(raw: string | null, now: number): PendingOAuth | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (value == null || typeof value !== 'object') return null
  const { nonce, startedAt } = value as Record<string, unknown>
  if (typeof nonce !== 'string' || nonce.length < 16) return null
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  if (now - startedAt > PENDING_OAUTH_TTL_MS || startedAt > now + CLOCK_SKEW_MS) return null
  return { nonce, startedAt }
}

// crypto.getRandomValues also works on plain-http origins, where randomUUID does not exist.
function newNonce(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Call right before sending the browser to the provider's authorization URL (sign-in and
 * signup only): parks the page to return to and marks this tab as expecting a callback.
 */
export function beginOAuthSignIn(redirect: unknown) {
  if (typeof window === 'undefined') return
  rememberPostSignInRedirect(redirect)
  const marker: PendingOAuth = { nonce: newNonce(), startedAt: Date.now() }
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(marker))
  } catch {
    // Storage unavailable: the callback refuses the session, as it would refuse a planted one.
  }
}

/**
 * True when this tab started an OAuth sign-in within the window. One-time: the marker is
 * removed whatever it holds, so a second callback in the same tab is refused.
 */
export function takePendingOAuth(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    window.sessionStorage.removeItem(storageKey)
    return parsePendingOAuth(raw, Date.now()) !== null
  } catch {
    return false
  }
}

/** Drops the marker when the attempt ended without a callback (the provider sent an error). */
export function forgetPendingOAuth() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch {
    // Nothing stored.
  }
}
