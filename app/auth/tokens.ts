import { ref } from 'vue'
import {
  addToSpentRefreshLedger,
  isSessionEndReason,
  readSpentRefreshLedger,
  spentRefreshLedgerHas,
  type SessionEndReason
} from '~/utils/session-lifecycle'

// Token storage — the ONLY genuine client state in auth (everything else, i.e. the current
// user and backend capabilities, is server state owned by Pinia Colada). Lives in app/auth/
// (infra), not utils/, because it holds a reactive singleton — utils/ is pure functions only.
// The localStorage keys are the ones the former React console used, so a deployment that
// replaces it keeps its admins signed in.
//
// `tokensPresent` is a reactive mirror of "do we have tokens", so Pinia Colada's `enabled`
// gate on the session query reacts to login/logout without polling localStorage.

const accessTokenKey = 'outlabs-auth.access-token'
const refreshTokenKey = 'outlabs-auth.refresh-token'
// Why the tokens were last cleared ({ reason, at }), so other tabs can explain the sign-out.
const sessionEndKey = 'outlabs-auth.session-end'
const SESSION_END_MARKER_TTL_MS = 60_000
// Fingerprints of refresh tokens this browser presented to /auth/refresh and got an answer for,
// shared by the tabs. See recordSpentRefreshToken.
const spentRefreshKey = 'outlabs-auth.spent-refresh'

export type StoredAuthTokens = {
  accessToken: string
  refreshToken: string
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function readHasTokens() {
  return isBrowser()
    ? Boolean(window.localStorage.getItem(accessTokenKey) && window.localStorage.getItem(refreshTokenKey))
    : false
}

// Reactive presence signal (read by the session query's `enabled` gate).
export const tokensPresent = ref(readHasTokens())

export function getStoredAccessToken() {
  return isBrowser() ? window.localStorage.getItem(accessTokenKey) : null
}

export function getStoredRefreshToken() {
  return isBrowser() ? window.localStorage.getItem(refreshTokenKey) : null
}

export function readStoredAuthTokens(): StoredAuthTokens | null {
  const accessToken = getStoredAccessToken()
  const refreshToken = getStoredRefreshToken()
  return accessToken && refreshToken ? { accessToken, refreshToken } : null
}

export function hasStoredAuthTokens() {
  return readHasTokens()
}

export function isAuthTokenStorageKey(key: string | null) {
  return key === accessTokenKey || key === refreshTokenKey
}

export function isAccessTokenStorageKey(key: string | null) {
  return key === accessTokenKey
}

export function setStoredAuthTokens(tokens: StoredAuthTokens) {
  if (!isBrowser()) return
  window.localStorage.setItem(accessTokenKey, tokens.accessToken)
  window.localStorage.setItem(refreshTokenKey, tokens.refreshToken)
  window.localStorage.removeItem(sessionEndKey)
  tokensPresent.value = true
}

// `reason` is recorded for the other tabs, which only see the tokens disappear.
export function clearStoredAuthTokens(reason?: SessionEndReason) {
  if (!isBrowser()) return
  if (reason) window.localStorage.setItem(sessionEndKey, JSON.stringify({ reason, at: Date.now() }))
  window.localStorage.removeItem(accessTokenKey)
  window.localStorage.removeItem(refreshTokenKey)
  tokensPresent.value = false
}

/**
 * Records that `token` was presented to /auth/refresh and the API answered (it rotated or
 * refused it). Called inside the cross-tab refresh lock, so a sign-out waiting on that lock
 * knows its captured refresh token is already spent and must not present it again (the
 * backend treats a second use as theft). A refresh whose answer was lost is deliberately not
 * recorded: presenting that token again is the only way left to end whatever it minted.
 */
export function recordSpentRefreshToken(token: string) {
  if (!isBrowser()) return
  try {
    const now = Date.now()
    const entries = readSpentRefreshLedger(window.localStorage.getItem(spentRefreshKey), now)
    window.localStorage.setItem(spentRefreshKey, JSON.stringify(addToSpentRefreshLedger(entries, token, now)))
  } catch {
    // Storage full or blocked: the sign-out falls back to presenting the token.
  }
}

export function isRefreshTokenSpent(token: string): boolean {
  if (!isBrowser()) return false
  try {
    return spentRefreshLedgerHas(readSpentRefreshLedger(window.localStorage.getItem(spentRefreshKey), Date.now()), token)
  } catch {
    return false
  }
}

// The reason recorded by the tab that last cleared the tokens, if recent.
export function readSessionEndMarker(): SessionEndReason | null {
  if (!isBrowser()) return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(sessionEndKey) ?? 'null') as { reason?: unknown, at?: unknown } | null
    if (!parsed || !isSessionEndReason(parsed.reason) || typeof parsed.at !== 'number') return null
    return Date.now() - parsed.at <= SESSION_END_MARKER_TTL_MS ? parsed.reason : null
  } catch {
    return null
  }
}
