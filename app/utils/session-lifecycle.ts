// Pure session-lifecycle rules shared by the API client, the boot plugin and the sign-in pages.
// No IO, no reactive state: each function maps a backend answer to a decision so the rules are
// unit-testable and stay in one place.

// Why a session ended. Carried on the forced sign-in redirect (?reason=) and rendered by the
// login page. Mirrors the backend's refresh-failure reasons plus the console's own sign-out.
export type SessionEndReason
  = | 'expired'
    | 'revoked'
    | 'reuse_detected'
    | 'password_changed'
    | 'account_inactive'
    | 'wrong_application'
    | 'signed_out'
    | 'signed_out_everywhere'

const SESSION_END_REASONS: readonly SessionEndReason[] = [
  'expired',
  'revoked',
  'reuse_detected',
  'password_changed',
  'account_inactive',
  'wrong_application',
  'signed_out',
  'signed_out_everywhere'
]

// A stored session could not be loaded at boot: the auth API did not answer, or answered in a
// way that neither confirms nor refuses the session.
export type BootError = {
  // The API origin the console tried to reach.
  origin: string
  message: string
  // No answer, or an answer that says "try again later" (network, timeout, 408, 429, 5xx).
  transient: boolean
}

export function isSessionEndReason(value: unknown): value is SessionEndReason {
  return typeof value === 'string' && (SESSION_END_REASONS as readonly string[]).includes(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value ? value : null
}

// The machine-readable code of an outlabsAuth error body ({ error, message, details }).
export function readApiErrorCode(payload: unknown): string | null {
  return readString(asRecord(payload), 'error')
}

// 401 codes that answer the request itself — a wrong current password, a locked or inactive
// account, a rejected API key — rather than rejecting the console's bearer token. Refreshing on
// these would rotate the refresh token and silently re-send the secret.
const ANSWER_CODES = new Set([
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_INACTIVE',
  'EMAIL_NOT_VERIFIED',
  'API_KEY_INVALID',
  'API_KEY_EXPIRED',
  'API_KEY_LOCKED',
  'REFRESH_TOKEN_INVALID'
])

// Codes the library also uses for one-time codes (phone verification): a token failure on an
// ordinary request, but the answer itself on an endpoint that checks a user-supplied secret.
const TOKEN_CODES = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID'])

/**
 * Whether a 401 body means "the bearer token was refused" (refresh and retry) as opposed to a
 * domain answer (show it). The backend's auth dependency answers with a bare FastAPI
 * `{ detail }` body or the wrapped `HTTP_ERROR` shape; domain failures carry a specific code.
 * `verifiesSecret` marks endpoints whose own TOKEN_* codes are answers (phone verification).
 */
export function isBearerRejection(payload: unknown, { verifiesSecret = false }: { verifiesSecret?: boolean } = {}): boolean {
  const code = readApiErrorCode(payload)
  if (code == null) return true
  if (ANSWER_CODES.has(code)) return false
  if (TOKEN_CODES.has(code)) return !verifiesSecret
  return code === 'HTTP_ERROR' || code === 'AUTHENTICATION_ERROR' || code === 'AUTH_ERROR'
}

/**
 * Whether a failed /auth/refresh proves the session is over. Only the refresh endpoint's own
 * refusals are proof: 400/401/403, 422 (a body it cannot accept will never become valid), and
 * a 404 that carries the library's USER_NOT_FOUND code (the account was deleted). Anything
 * else keeps the stored tokens: network failures, timeouts, 408, 429, 5xx, and a bare 404, 405
 * or 413 from a misrouted proxy or a missing route, which say nothing about the token.
 */
export function isDefinitiveRefreshFailure(status: number, payload?: unknown): boolean {
  if (status === 400 || status === 401 || status === 403 || status === 422) return true
  return status === 404 && readApiErrorCode(payload) === 'USER_NOT_FOUND'
}

/** Maps a definitive /auth/refresh failure to the reason shown on the sign-in page. */
export function sessionEndReasonFromRefreshFailure(status: number, payload: unknown): SessionEndReason {
  const body = asRecord(payload)
  const details = asRecord(body?.details) ?? asRecord(body?.detail)
  const code = readApiErrorCode(payload)
  const reason = readString(details, 'reason')
  const detailCode = readString(details, 'code')

  if (status === 403 && detailCode === 'wrong_application') return 'wrong_application'
  if (reason === 'reuse_detected') return 'reuse_detected'
  if (reason === 'password_changed') return 'password_changed'
  if (reason === 'revoked') {
    const revokedReason = readString(details, 'revoked_reason') ?? ''
    return /password (changed|reset)/i.test(revokedReason) ? 'password_changed' : 'revoked'
  }
  if (code === 'ACCOUNT_LOCKED' || code === 'ACCOUNT_INACTIVE' || code === 'USER_NOT_FOUND') return 'account_inactive'
  return 'expired'
}

/**
 * A short fingerprint of a token (cyrb53), so the console can remember which refresh tokens
 * were already spent without keeping a second copy of them. Not a security hash: it only has
 * to tell this browser's own tokens apart.
 */
export function tokenFingerprint(token: string): string {
  let h1 = 0xDEADBEEF ^ token.length
  let h2 = 0x41C6CE57 ^ token.length
  for (let i = 0; i < token.length; i++) {
    const ch = token.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// The spent-refresh-token ledger: fingerprints of refresh tokens the API has already answered
// for, kept briefly and capped. Only a sign-out waiting on the refresh lock reads it, so a few
// minutes of memory are enough.
export type SpentRefreshEntry = { fp: string, at: number }
const SPENT_REFRESH_TTL_MS = 10 * 60_000
const SPENT_REFRESH_MAX = 16

/** The ledger's live entries from its stored JSON (anything unreadable counts as empty). */
export function readSpentRefreshLedger(raw: string | null, now: number): SpentRefreshEntry[] {
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is SpentRefreshEntry =>
      typeof entry?.fp === 'string' && typeof entry?.at === 'number' && now - entry.at <= SPENT_REFRESH_TTL_MS)
  } catch {
    return []
  }
}

export function addToSpentRefreshLedger(entries: SpentRefreshEntry[], token: string, now: number): SpentRefreshEntry[] {
  return [...entries, { fp: tokenFingerprint(token), at: now }].slice(-SPENT_REFRESH_MAX)
}

export function spentRefreshLedgerHas(entries: SpentRefreshEntry[], token: string): boolean {
  const fp = tokenFingerprint(token)
  return entries.some(entry => entry.fp === fp)
}

/**
 * Only in-app targets are honoured as a post-sign-in destination (open-redirect guard).
 * Returns the path, or null when the value is missing or points anywhere else.
 */
export function safeAppRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/app/') || value.includes('\\')) return null
  return value
}

/**
 * Where the current actor's effective permissions come from on this backend: the permissions
 * router when mounted, else the minimal self-service users router, else nowhere (empty set).
 * Backends that predate `mounted_surfaces` are assumed to mount the permissions router.
 */
export function myPermissionsPath(mountedSurfaces: readonly string[] | null | undefined): string | null {
  if (!Array.isArray(mountedSurfaces)) return '/permissions/me'
  if (mountedSurfaces.includes('permissions')) return '/permissions/me'
  if (mountedSurfaces.includes('self_service_users')) return '/users/me/permissions'
  return null
}

// Minimal JWT payload read — the console never verifies tokens (the API does); it only needs
// a few claims: the subject, to tell a token rotation from a different identity signing in in
// another tab, and when a token was issued, to recognise this browser's own session row.
function readJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null
  const segment = token.split('.')[1]
  if (!segment) return null
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return asRecord(JSON.parse(atob(padded)))
  } catch {
    return null
  }
}

export function readJwtSubject(token: string | null | undefined): string | null {
  return readString(readJwtClaims(token), 'sub')
}

/**
 * True when two access tokens are known to belong to different accounts: both name a subject and
 * the subjects differ. Opaque or unreadable tokens are never known to differ.
 */
export function tokensNameDifferentSubjects(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = readJwtSubject(a)
  const second = readJwtSubject(b)
  return first != null && second != null && first !== second
}
