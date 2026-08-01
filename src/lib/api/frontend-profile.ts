import { getRuntimeConfig } from '@/lib/runtime-config'

export function withFrontendProfile<T extends object>(input: T) {
  const app = getRuntimeConfig().frontendProfileKey

  return app ? { ...input, app } : input
}

export function withFrontendProfileQuery(path: string) {
  const app = getRuntimeConfig().frontendProfileKey

  if (!app) {
    return path
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}app=${encodeURIComponent(app)}`
}
