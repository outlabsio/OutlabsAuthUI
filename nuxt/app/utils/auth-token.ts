import { ref } from 'vue'

// Token storage — the ONLY genuine client state in auth (everything else, i.e. the current
// user and backend capabilities, is server state owned by Pinia Colada). localStorage keys
// are unchanged from the React app so a session minted by either app is interchangeable.
//
// `tokensPresent` is a reactive mirror of "do we have tokens", so Pinia Colada's `enabled`
// gate on the session query reacts to login/logout without polling localStorage.

const accessTokenKey = 'outlabs-auth.access-token'
const refreshTokenKey = 'outlabs-auth.refresh-token'

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

export function hasStoredAuthTokens() {
  return readHasTokens()
}

export function isAuthTokenStorageKey(key: string | null) {
  return key === accessTokenKey || key === refreshTokenKey
}

export function setStoredAuthTokens(tokens: StoredAuthTokens) {
  if (!isBrowser()) return
  window.localStorage.setItem(accessTokenKey, tokens.accessToken)
  window.localStorage.setItem(refreshTokenKey, tokens.refreshToken)
  tokensPresent.value = true
}

export function clearStoredAuthTokens() {
  if (!isBrowser()) return
  window.localStorage.removeItem(accessTokenKey)
  window.localStorage.removeItem(refreshTokenKey)
  tokensPresent.value = false
}
