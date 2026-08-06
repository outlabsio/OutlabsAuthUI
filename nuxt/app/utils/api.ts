import {
  clearStoredAuthTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredAuthTokens
} from '~/utils/auth-token'
import { getRuntimeConfig } from '~/utils/runtime-config'

// The one thin API client (A3 hard rule): base URL + auth-prefix resolution, bearer
// injection, single-flight 401 refresh, and error normalization. Pinia Colada calls this;
// components and stores never call $fetch directly. Ported from the React src/lib/api/*.

export type ApiErrorPayload = Record<string, unknown> & {
  detail?: unknown
  details?: unknown
  error?: string
  message?: string
}

export class ApiError extends Error {
  status: number
  statusText: string
  data: ApiErrorPayload | null

  constructor(init: { message: string, status: number, statusText: string, data: ApiErrorPayload | null }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.statusText = init.statusText
    this.data = init.data
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function extractValidationMessage(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const first = value.find(isRecord)
  if (!first) return null
  const message
    = typeof first.message === 'string'
      ? first.message
      : typeof first.msg === 'string'
        ? first.msg
        : null
  if (!message) return null
  const location = Array.isArray(first.loc)
    ? first.loc
        .filter((s): s is string | number => typeof s === 'string' || typeof s === 'number')
        .slice(1)
        .join('.')
    : ''
  return location ? `${location}: ${message}` : message
}

function extractNestedMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (Array.isArray(value)) return extractValidationMessage(value)
  if (!isRecord(value)) return null
  if (typeof value.detail === 'string' && value.detail.trim()) return value.detail
  if (typeof value.message === 'string' && value.message.trim()) return value.message
  const validation = extractValidationMessage(value.errors)
  if (validation) return validation
  return extractNestedMessage(value.details)
}

export function getApiErrorMessageFromPayload(payload: ApiErrorPayload | null | undefined): string | null {
  if (!payload) return null
  return (
    extractNestedMessage(payload.detail)
    ?? extractNestedMessage(payload.details)
    ?? (typeof payload.message === 'string' && payload.message.trim() ? payload.message : null)
  )
}

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (!(error instanceof ApiError)) return fallback
  return (getApiErrorMessageFromPayload(error.data) ?? error.message) || fallback
}

function getRetryAfterSeconds(error: ApiError): number | null {
  const data = error.data
  if (!isRecord(data)) return null
  const nested = isRecord(data.details) ? data.details : data
  const secs = (nested as Record<string, unknown>).retry_after_seconds ?? data.retry_after_seconds
  return typeof secs === 'number' && Number.isFinite(secs) ? Math.max(1, Math.ceil(secs)) : null
}

// Auth-request error → toast title/description, with a friendly cooldown for 429s.
export function describeAuthError(error: unknown, fallbackTitle: string): { title: string, description: string } {
  if (error instanceof ApiError && error.status === 429) {
    const secs = getRetryAfterSeconds(error)
    return {
      title: 'Please wait a moment',
      description: secs ? `Too many requests — try again in ${secs} second${secs === 1 ? '' : 's'}.` : 'Too many requests — try again shortly.'
    }
  }
  return { title: fallbackTitle, description: getApiErrorMessage(error) }
}

// Session-expired signal — the session store listens and redirects to login.
export const authSessionExpiredEvent = 'outlabs-auth:session-expired'

export function expireAuthSession() {
  clearStoredAuthTokens()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(authSessionExpiredEvent))
  }
}

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

function resolveApiPath(path: string) {
  const prefix = ensureLeadingSlash(getRuntimeConfig().authApiPrefix)
  const normalized = ensureLeadingSlash(path)
  return normalized.startsWith(prefix) ? normalized : `${prefix}${normalized}`
}

export function buildApiUrl(path: string) {
  return `${getRuntimeConfig().apiBaseUrl}${resolveApiPath(path)}`
}

// Attach the frontend-profile key (A1) to a body/query when the deployment declares one.
export function withFrontendProfile<T extends object>(input: T): T & { app?: string } {
  const app = getRuntimeConfig().frontendProfileKey
  return app ? { ...input, app } : input
}

// Same, but as a query-string param (used by GET flows like OAuth authorize).
export function withFrontendProfileQuery(path: string): string {
  const app = getRuntimeConfig().frontendProfileKey
  if (!app) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}app=${encodeURIComponent(app)}`
}

type RequestBody = BodyInit | Record<string, unknown> | null | undefined

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  auth?: boolean
  body?: RequestBody
}

type RefreshResponse = { access_token: string, refresh_token: string }

let refreshAccessTokenPromise: Promise<string> | null = null

function isPlainObject(value: RequestBody): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  if (value instanceof FormData || value instanceof Blob) return false
  return Object.getPrototypeOf(value) === Object.prototype
}

async function parseAndThrow(response: Response): Promise<never> {
  let data: ApiErrorPayload | null
  try {
    const parsed = await response.json()
    data = isRecord(parsed) ? (parsed as ApiErrorPayload) : null
  } catch {
    data = null
  }
  throw new ApiError({
    message: (getApiErrorMessageFromPayload(data) ?? response.statusText) || 'Request failed',
    status: response.status,
    statusText: response.statusText,
    data
  })
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) {
    expireAuthSession()
    throw new ApiError({ message: 'Session expired.', status: 401, statusText: 'Unauthorized', data: null })
  }

  const response = await fetch(buildApiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })

  if (!response.ok) {
    expireAuthSession()
    await parseAndThrow(response)
  }

  const tokens = (await response.json()) as RefreshResponse
  setStoredAuthTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
  return tokens.access_token
}

function refreshAccessTokenOnce(): Promise<string> {
  refreshAccessTokenPromise ??= refreshAccessToken().finally(() => {
    refreshAccessTokenPromise = null
  })
  return refreshAccessTokenPromise
}

async function request<T>(path: string, options: ApiRequestOptions = {}, hasRetried = false): Promise<T> {
  const { auth = true, headers, body, credentials = 'include', ...init } = options
  const requestHeaders = new Headers(headers)

  if (auth) {
    const accessToken = getStoredAccessToken()
    if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  let requestBody: BodyInit | undefined
  if (isPlainObject(body)) {
    requestHeaders.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(body)
  } else if (body != null) {
    requestBody = body as BodyInit
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials,
    headers: requestHeaders,
    body: requestBody
  })

  if (response.status === 401 && auth && !hasRetried && getStoredRefreshToken()) {
    try {
      const nextAccessToken = await refreshAccessTokenOnce()
      return request<T>(
        path,
        { ...options, headers: { ...Object.fromEntries(requestHeaders.entries()), Authorization: `Bearer ${nextAccessToken}` } },
        true
      )
    } catch (error) {
      expireAuthSession()
      throw error
    }
  }

  if (!response.ok) {
    await parseAndThrow(response)
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T
  }
  return undefined as T
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) => request<T>(path, { ...options, method: 'POST' }),
  put: <T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) => request<T>(path, { ...options, method: 'PUT' }),
  patch: <T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) => request<T>(path, { ...options, method: 'PATCH' }),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) => request<T>(path, { ...options, method: 'DELETE' })
}
