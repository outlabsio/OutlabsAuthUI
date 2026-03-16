function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

export const apiConfig = {
  baseUrl: trimTrailingSlash(
    import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8004'
  ),
  authPrefix: ensureLeadingSlash(import.meta.env.VITE_AUTH_API_PREFIX ?? '/v1'),
}

export function resolveApiPath(path: string) {
  const normalizedPath = ensureLeadingSlash(path)

  if (normalizedPath.startsWith(apiConfig.authPrefix)) {
    return normalizedPath
  }

  return `${apiConfig.authPrefix}${normalizedPath}`
}

export function buildApiUrl(path: string) {
  return `${apiConfig.baseUrl}${resolveApiPath(path)}`
}
