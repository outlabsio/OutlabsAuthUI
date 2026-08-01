import { getRuntimeConfig } from '@/lib/runtime-config'

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

export const apiConfig = {
  get baseUrl() {
    return getRuntimeConfig().apiBaseUrl
  },
  get authPrefix() {
    return ensureLeadingSlash(getRuntimeConfig().authApiPrefix)
  },
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
