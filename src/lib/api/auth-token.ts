const accessTokenKey = 'outlabs-auth.access-token'
const refreshTokenKey = 'outlabs-auth.refresh-token'

function isBrowser() {
  return typeof window !== 'undefined'
}

export type StoredAuthTokens = {
  accessToken: string
  refreshToken: string
}

export function getStoredAccessToken() {
  if (!isBrowser()) {
    return null
  }

  return window.localStorage.getItem(accessTokenKey)
}

export function getStoredRefreshToken() {
  if (!isBrowser()) {
    return null
  }

  return window.localStorage.getItem(refreshTokenKey)
}

export function hasStoredAuthTokens() {
  return Boolean(getStoredAccessToken() && getStoredRefreshToken())
}

export function setStoredAuthTokens(tokens: StoredAuthTokens) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(accessTokenKey, tokens.accessToken)
  window.localStorage.setItem(refreshTokenKey, tokens.refreshToken)
}

export function clearStoredAuthTokens() {
  if (!isBrowser()) {
    return
  }

  window.localStorage.removeItem(accessTokenKey)
  window.localStorage.removeItem(refreshTokenKey)
}
