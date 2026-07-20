const chunkReloadFlagKey = 'outlabs-auth-ui.chunk-reload-attempted'

const chunkLoadErrorPattern =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i

function isBrowser() {
  return typeof window !== 'undefined'
}

export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return chunkLoadErrorPattern.test(error.message)
}

export function hasAttemptedChunkReload() {
  if (!isBrowser()) {
    return false
  }

  return window.sessionStorage.getItem(chunkReloadFlagKey) === '1'
}

export function clearChunkReloadFlag() {
  if (!isBrowser()) {
    return
  }

  window.sessionStorage.removeItem(chunkReloadFlagKey)
}

/**
 * Reloads the page once to recover from a stale-chunk error (e.g. after a new
 * deploy invalidates previously fetched JS chunk URLs). Guarded by a
 * sessionStorage flag so a persistently failing chunk cannot loop reloads.
 * Returns whether a reload was actually triggered.
 */
export function reloadOnceForChunkError() {
  if (!isBrowser() || hasAttemptedChunkReload()) {
    return false
  }

  window.sessionStorage.setItem(chunkReloadFlagKey, '1')
  window.location.reload()
  return true
}
