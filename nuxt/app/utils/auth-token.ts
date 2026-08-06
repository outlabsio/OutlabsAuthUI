// Token storage — ported verbatim from the React app (localStorage keys unchanged) so a
// session minted by either app is interchangeable during cutover.

const accessTokenKey = 'outlabs-auth.access-token'
const refreshTokenKey = 'outlabs-auth.refresh-token'

export type StoredAuthTokens = {
  accessToken: string
  refreshToken: string
}

function isBrowser() {
  return typeof window !== 'undefined'
}

export function getStoredAccessToken() {
  return isBrowser() ? window.localStorage.getItem(accessTokenKey) : null
}

export function getStoredRefreshToken() {
  return isBrowser() ? window.localStorage.getItem(refreshTokenKey) : null
}

export function hasStoredAuthTokens() {
  return Boolean(getStoredAccessToken() && getStoredRefreshToken())
}

export function isAuthTokenStorageKey(key: string | null) {
  return key === accessTokenKey || key === refreshTokenKey
}

export function setStoredAuthTokens(tokens: StoredAuthTokens) {
  if (!isBrowser()) return
  window.localStorage.setItem(accessTokenKey, tokens.accessToken)
  window.localStorage.setItem(refreshTokenKey, tokens.refreshToken)
}

export function clearStoredAuthTokens() {
  if (!isBrowser()) return
  window.localStorage.removeItem(accessTokenKey)
  window.localStorage.removeItem(refreshTokenKey)
}
