import { RefreshLockTimeoutError, withRefreshLock } from '~/auth/refresh-lock'
import { announceSessionEnd } from '~/auth/session-events'
import {
  clearStoredAuthTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  hasStoredAuthTokens,
  isRefreshTokenSpent,
  readStoredAuthTokens,
  recordSpentRefreshToken,
  setStoredAuthTokens,
  type StoredAuthTokens
} from '~/auth/tokens'
import { getRuntimeConfig } from '~/utils/runtime-config'
import {
  isBearerRejection,
  isDefinitiveRefreshFailure,
  sessionEndReasonFromRefreshFailure,
  tokensNameDifferentSubjects,
  type BootError,
  type SessionEndReason
} from '~/utils/session-lifecycle'
import { ApiError, getApiErrorMessageFromPayload, isTransientApiError, parseRetryAfterHeader, type ApiErrorPayload } from './errors'

// The one thin API client (A3 hard rule): base URL + auth-prefix resolution, bearer
// injection, request timeouts, the session refresh protocol, and error normalization. Pinia
// Colada calls this; components and stores never call fetch directly.
//
// Session protocol (see ARCHITECTURE.md "Session lifecycle"):
// - a 401 that refuses the bearer token is renewed once through /auth/refresh and replayed;
//   a 401 that answers the request (wrong current password, wrong one-time code) is not;
// - refreshes are single-flight in the tab and serialized across tabs (refresh-lock), and a
//   tab reuses a rotation another tab already made instead of presenting a spent token;
// - only a refused refresh ends the session; network failures, timeouts, 429 and 5xx keep the
//   tokens and surface as retryable errors.

// The error model (ApiError, normalizeApiError and the message helpers) lives in ./errors so it
// stays pure and unit-testable; it is re-exported here for existing imports.
export {
  ApiError,
  describeAuthError,
  getApiErrorMessage,
  getApiErrorMessageFromPayload,
  isSessionEndedError,
  isTransientApiError,
  normalizeApiError,
  type ApiErrorKind,
  type ApiErrorPayload,
  type ApiFailureKind,
  type NormalizedApiError
} from './errors'

// Operator-facing explanation of why the API could not be used (boot screen). Built from the
// failure's kind and status, never the response body, which may describe a different request.
// Only outage-like answers are called temporary; anything else (a 404 from a wrong base URL or
// auth prefix, a 403 from a proxy) points at the configuration instead.
export function describeUnavailableApi(error: ApiError): string {
  const origin = getApiOrigin()
  if (error.kind === 'network') {
    return `The console could not reach ${origin}. Check that the API is running, that it allows this console's origin (CORS), and that the Content-Security-Policy connect-src includes it.`
  }
  if (error.kind === 'timeout') return error.message
  const answered = `${origin} answered HTTP ${error.status} while loading your session.`
  return isTransientApiError(error)
    ? `${answered} This is usually temporary.`
    : `${answered} Check that the console points at the right API base URL and auth prefix.`
}

// The boot screen's state for a session that could not be loaded.
export function bootErrorFrom(error: ApiError): BootError {
  return { origin: getApiOrigin(), message: describeUnavailableApi(error), transient: isTransientApiError(error) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
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

// The configured API origin, for messages that tell an operator where the console is pointed.
export function getApiOrigin(): string {
  const base = getRuntimeConfig().apiBaseUrl
  try {
    return new URL(base).origin
  } catch {
    return base
  }
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

// ── Transport: timeouts and "no answer" errors ──

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

function networkError(): ApiError {
  return new ApiError({
    kind: 'network',
    status: 0,
    statusText: '',
    data: null,
    message: `Can't reach the auth API at ${getApiOrigin()}. Check that it is running, that it allows this console's origin (CORS), and that the Content-Security-Policy connect-src includes it.`
  })
}

function timeoutError(timeoutMs: number): ApiError {
  return new ApiError({
    kind: 'timeout',
    status: 0,
    statusText: '',
    data: null,
    message: `The auth API at ${getApiOrigin()} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
  })
}

type SendOptions = { signal?: AbortSignal | null, timeoutMs: number }

// fetch with a timeout. A caller's own abort (e.g. Pinia Colada cancelling a query) rethrows
// the caller's reason untouched; a timeout or a failed connection becomes a typed ApiError.
async function send(url: string, init: RequestInit, { signal, timeoutMs }: SendOptions): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) forwardAbort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error
    throw timedOut ? timeoutError(timeoutMs) : networkError()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

async function readJsonPayload(response: Response): Promise<ApiErrorPayload | null> {
  try {
    const parsed = await response.json()
    return isRecord(parsed) ? (parsed as ApiErrorPayload) : null
  } catch {
    return null
  }
}

async function parseAndThrow(response: Response): Promise<never> {
  const data = await readJsonPayload(response)
  throw new ApiError({
    message: (getApiErrorMessageFromPayload(data) ?? response.statusText) || 'Request failed',
    status: response.status,
    statusText: response.statusText,
    data,
    source: 'response',
    // Readable only when the API exposes it (CORS); the body's retry_after_seconds wins anyway.
    retryAfterSeconds: parseRetryAfterHeader(response.headers.get('Retry-After'))
  })
}

// ── Session: end, refresh, revoke ──

type TokenPairResponse = { access_token: string, refresh_token: string }

function sessionEndedError(status = 401, data: ApiErrorPayload | null = null): ApiError {
  return new ApiError({ kind: 'session_ended', status, statusText: 'Unauthorized', data, source: 'client', message: 'Your session has ended. Sign in again to continue.' })
}

// A renewal that could not complete. The tokens are kept, so the admin stays signed in. The
// message is the console's own (the refresh endpoint's body would describe the wrong request).
function renewalUnavailableError(cause: ApiError | { status: number }): ApiError {
  const origin = getApiOrigin()
  const status = cause.status
  const message = cause instanceof ApiError && cause.kind === 'timeout'
    ? `The auth API at ${origin} did not answer while renewing your session. You are still signed in; try again in a moment.`
    : status === 0
      ? `Can't reach the auth API at ${origin} to renew your session. You are still signed in; check your connection and try again.`
      : status === 429
        ? 'Too many requests while renewing your session. You are still signed in; try again in a moment.'
        : `The auth API at ${origin} could not renew your session (HTTP ${status}). You are still signed in; try again in a moment.`
  return new ApiError({
    kind: cause instanceof ApiError && cause.kind !== 'http' ? cause.kind : 'http',
    status,
    statusText: cause instanceof ApiError ? cause.statusText : '',
    data: null,
    message
  })
}

/**
 * Ends this browser's session locally: clears the tokens (recording why, for other tabs) and
 * announces it once. A no-op when the tokens are already gone, so concurrent failures emit a
 * single event.
 */
export function endSession(reason: SessionEndReason) {
  if (!hasStoredAuthTokens()) return
  clearStoredAuthTokens(reason)
  announceSessionEnd(reason)
}

// keepalive: the sign-out path, which should still reach the API if the tab closes.
function postRefresh(refreshToken: string, { keepalive = false } = {}): Promise<Response> {
  return send(buildApiUrl('/auth/refresh'), {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  }, { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS })
}

// Revokes one session server-side: blacklists the access token (immediate) and revokes the
// refresh token named in the body. keepalive lets it finish if the tab closes right away.
function postLogout(tokens: StoredAuthTokens): Promise<Response> {
  return send(buildApiUrl('/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.accessToken}` },
    body: JSON.stringify({ refresh_token: tokens.refreshToken, immediate: true })
  }, { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS })
}

// Runs inside the cross-tab lock. `rejected` is the access token the API just refused.
async function refreshUnderLock(rejected: string): Promise<string> {
  const current = readStoredAuthTokens()
  // Signed out meanwhile (here or in another tab): nothing to renew.
  if (!current) throw sessionEndedError()
  if (current.accessToken !== rejected) {
    // Another account signed in meanwhile in another tab: replaying with its token would run this
    // tab's request (a save the user started) as that account. The tab is reloaded into the new
    // identity by the session-sync plugin; the request ends here.
    if (tokensNameDifferentSubjects(rejected, current.accessToken)) throw sessionEndedError()
    // Another tab (or an earlier refresh here) already rotated: use its token.
    return current.accessToken
  }

  let response: Response
  try {
    response = await postRefresh(current.refreshToken)
  } catch (error) {
    // No answer: the API may or may not have rotated the token, so it is not marked spent.
    throw error instanceof ApiError ? renewalUnavailableError(error) : error
  }

  if (!response.ok) {
    const data = await readJsonPayload(response)
    if (!isDefinitiveRefreshFailure(response.status, data)) {
      throw renewalUnavailableError({ status: response.status })
    }
    recordSpentRefreshToken(current.refreshToken)
    // Only end the session that was presented; storage may already hold a newer sign-in.
    if (getStoredRefreshToken() === current.refreshToken) {
      endSession(sessionEndReasonFromRefreshFailure(response.status, data))
    }
    throw sessionEndedError(response.status, data)
  }

  recordSpentRefreshToken(current.refreshToken)
  const tokens = (await response.json()) as TokenPairResponse
  const minted = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token }
  if (getStoredRefreshToken() !== current.refreshToken) {
    // Signed out (or into another account) while this refresh was in flight. The pair just
    // minted belongs to no one: revoke it rather than leave a live session behind.
    void postLogout(minted).catch(() => undefined)
    throw sessionEndedError()
  }
  setStoredAuthTokens(minted)
  return minted.accessToken
}

let refreshInFlight: Promise<string> | null = null

// An access token to replay with after `rejected` was refused.
function refreshSession(rejected: string): Promise<string> {
  refreshInFlight ??= withRefreshLock(() => refreshUnderLock(rejected))
    .catch((error: unknown) => {
      if (error instanceof RefreshLockTimeoutError) throw renewalUnavailableError(timeoutError(DEFAULT_REQUEST_TIMEOUT_MS))
      throw error
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

/**
 * Renews the stored session now, through the same single-flight, cross-tab renewal as a refused
 * request, for an answer that needs a newer access token than the one stored. outlabs-auth
 * 0.1.0a35 names the session in its access tokens (`sid`); one minted before it names none, and
 * a renewal adds it. Fails like that renewal: a refused refresh ends the session.
 */
export async function renewAccessToken(): Promise<void> {
  const stored = getStoredAccessToken()
  if (!stored) throw sessionEndedError()
  await refreshSession(stored)
}

/**
 * Revokes a session server-side from tokens captured at sign-out (storage is already clear).
 * When the access token has expired, the captured refresh token is renewed first so the
 * logout names the live refresh token, not one the renewal just rotated. Both requests use
 * keepalive, but the logout can only be sent once the renewal has answered. Best effort: never
 * throws, because local sign-out has already happened.
 */
export async function revokeServerSession(tokens: StoredAuthTokens): Promise<void> {
  try {
    await withRefreshLock(async () => {
      const first = await postLogout(tokens)
      if (first.status !== 401) return
      // A tab that held the lock before us already presented this refresh token and got an
      // answer: it was rotated (that tab stores or revokes the result itself) or refused.
      // Presenting it again would trip the backend's reuse detection and sign the user out
      // everywhere.
      if (isRefreshTokenSpent(tokens.refreshToken)) return
      const renewed = await postRefresh(tokens.refreshToken, { keepalive: true })
      if (!renewed.ok) {
        if (isDefinitiveRefreshFailure(renewed.status, await readJsonPayload(renewed))) recordSpentRefreshToken(tokens.refreshToken)
        return
      }
      recordSpentRefreshToken(tokens.refreshToken)
      const pair = (await renewed.json()) as TokenPairResponse
      await postLogout({ accessToken: pair.access_token, refreshToken: pair.refresh_token })
    })
  } catch {
    // Unreachable API or lock timeout: nothing more the console can do.
  }
}

/**
 * After "sign out everywhere" (DELETE /users/me/sessions revoked every refresh token of the
 * account), blacklists the access token this tab held, so a copy of it stops working now rather
 * than when it expires. POST /auth/logout without a refresh token revokes the account's refresh
 * tokens (already revoked) and, with `immediate`, blacklists the presented access token; a
 * logout naming this tab's refresh token would stop at that revoked token before the blacklist.
 * The blacklist is only consulted where the host turns token blacklisting on (with Redis), as
 * for every immediate logout. Best effort: never throws, because local sign-out has already
 * happened.
 */
export async function blacklistAccessToken(accessToken: string): Promise<void> {
  try {
    await send(buildApiUrl('/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ immediate: true })
    }, { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS })
  } catch {
    // Unreachable API: the token expires on its own.
  }
}

// ── Requests ──

// A plain object or an array is sent as JSON (a few routes take a bare JSON array, e.g. the
// permission names of POST/DELETE /roles/{id}/permissions).
type RequestBody = BodyInit | Record<string, unknown> | unknown[] | null | undefined

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  // Attach the stored bearer token and renew it on refusal (default true).
  auth?: boolean
  body?: RequestBody
  // Use this bearer instead of the stored one. Never renewed: a refusal is final (used to
  // verify freshly minted tokens before they are stored).
  accessToken?: string
  // The endpoint checks a user-supplied secret (current password, one-time code): its own
  // TOKEN_* 401 codes are answers, so they must not trigger a renewal and replay.
  verifiesSecret?: boolean
  timeoutMs?: number
}

function isJsonBody(value: RequestBody): value is Record<string, unknown> | unknown[] {
  if (value == null || typeof value !== 'object') return false
  if (Array.isArray(value)) return true
  if (value instanceof FormData || value instanceof Blob) return false
  return Object.getPrototypeOf(value) === Object.prototype
}

async function peekPayload(response: Response): Promise<ApiErrorPayload | null> {
  return readJsonPayload(response.clone())
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    auth = true,
    accessToken: explicitToken,
    verifiesSecret = false,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    headers,
    body,
    credentials = 'include',
    signal,
    ...init
  } = options
  const url = buildApiUrl(path)
  const baseHeaders = new Headers(headers)

  let requestBody: BodyInit | undefined
  if (isJsonBody(body)) {
    baseHeaders.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(body)
  } else if (body != null) {
    requestBody = body as BodyInit
  }

  const attempt = (bearer: string | null) => {
    const requestHeaders = new Headers(baseHeaders)
    if (bearer) requestHeaders.set('Authorization', `Bearer ${bearer}`)
    return send(url, { ...init, credentials, headers: requestHeaders, body: requestBody }, { signal, timeoutMs })
  }

  const bearer = auth ? (explicitToken ?? getStoredAccessToken()) : null
  let response = await attempt(bearer)

  if (response.status === 401 && bearer && !explicitToken && isBearerRejection(await peekPayload(response), { verifiesSecret })) {
    const renewed = await refreshSession(bearer)
    response = await attempt(renewed)
    if (response.status === 401 && isBearerRejection(await peekPayload(response), { verifiesSecret })) {
      // Refused again right after a renewal: this session can no longer be used.
      if (getStoredAccessToken() === renewed) endSession('expired')
      throw sessionEndedError(401, await readJsonPayload(response))
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
