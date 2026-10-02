// The console's error model. Every failed request becomes an ApiError (app/api/client.ts), and
// every consumer reads it through normalizeApiError(): one classification (kind), the backend's
// stable code, one user-facing sentence, the field-level validation issues, the permissions a
// denial names and a rate-limit cooldown. useApiAction and useApiErrorMessage are built on it,
// so no surface re-parses response bodies itself.
//
// Pure module: no runtime config, no Vue. The backend answers in three envelopes, all handled:
// - the library's `{ error: CODE, message, details }` (OutlabsAuthException, and with the
//   global handlers also HTTPException -> HTTP_ERROR and request validation -> VALIDATION_ERROR
//   with details.errors[]);
// - FastAPI's own `{ detail: string | object | ValidationError[] }` (hosts that register only
//   the library's handler);
// - no JSON at all (a proxy's 502 page).
// Match on `code`, never on the message: the code is the backend's stable contract.

export type ApiErrorPayload = Record<string, unknown> & {
  detail?: unknown
  details?: unknown
  error?: string
  message?: string
}

// How a request failed at the transport level. `http`: the API answered with an error status.
// `network`: no answer (offline, DNS, CORS or connect-src refusal). `timeout`: no answer in time.
// `session_ended`: the session is over and the session layer is already routing to sign-in.
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'session_ended'

export type ApiErrorInit = {
  message: string
  status: number
  statusText: string
  data: ApiErrorPayload | null
  kind?: ApiErrorKind
  // 'response': built from an API answer, so the copy comes from the error model. 'client': the
  // console wrote the message itself (no answer, renewal failures, ended sessions) and it is kept.
  // Defaults to 'response' when a payload is present.
  source?: 'response' | 'client'
  // From the Retry-After header, when the browser may read it.
  retryAfterSeconds?: number | null
}

export class ApiError extends Error {
  status: number
  statusText: string
  data: ApiErrorPayload | null
  kind: ApiErrorKind
  source: 'response' | 'client'
  retryAfterSeconds: number | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.statusText = init.statusText
    this.data = init.data
    this.kind = init.kind ?? 'http'
    this.source = init.source ?? (init.data != null ? 'response' : 'client')
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }
}

// No answer, or an answer that says "try again later". The session stays; the UI offers retry.
export function isTransientApiError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false
  if (error.kind === 'network' || error.kind === 'timeout') return true
  return error.kind === 'http' && (error.status >= 500 || error.status === 408 || error.status === 429)
}

// The request failed because the session ended; the session layer handles the redirect, so
// callers should not add their own error toast.
export function isSessionEndedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.kind === 'session_ended'
}

// ── The normalized error ──

/** What kind of failure this is; decides how the UI treats it (see useApiAction). */
export type ApiFailureKind
  = | 'validation' // 400/413/422: the input was refused; field issues when the API names fields
    | 'forbidden' // 403: not allowed (missing or undelegable permissions, wrong application)
    | 'not_found' // 404/410: the record (or the route) does not exist for this actor
    | 'conflict' // 409/412/423: clashes with the current state (duplicates, in use)
    | 'rate_limited' // 429
    | 'unauthorized' // 401 that answers the request (wrong password or code), or an ended session
    | 'server' // 5xx
    | 'network' // no answer
    | 'timeout' // no answer in time (or 408)
    | 'unknown' // anything else, including errors that are not ApiErrors

/** One validation problem. `path` is the wire field path ('' when it names no field). */
export type ApiIssue = {
  path: string
  // Human label for the path ('Subject user ID'); '' without a path.
  label: string
  message: string
}

export type NormalizedApiError = {
  kind: ApiFailureKind
  // HTTP status; 0 when there was no answer or the error is not an ApiError.
  status: number
  // The backend's most specific machine code (PERMISSION_DENIED, wrong_application, ...).
  code: string | null
  // One user-facing sentence (or a short list) for a toast description or an inline alert.
  message: string
  // The payload's `details` (or a structured FastAPI `detail`), for callers that need more.
  details: Record<string, unknown>
  // Every validation issue, in the order the API listed them.
  issues: ApiIssue[]
  // Wire path -> first message, for mapping onto form fields.
  fieldErrors: Record<string, string>
  // Permissions the actor lacks (delegation checks, all-of requirements).
  missingPermissions: string[]
  // Any-of requirements the actor meets none of.
  requiredPermissions: string[]
  retryAfterSeconds: number | null
  // The session is over; the session layer explains it on the sign-in page.
  sessionEnded: boolean
  // Worth retrying as-is (no answer, timeout, 429, 5xx).
  transient: boolean
  // True when `message` is the console's generic copy rather than a specific API explanation.
  generic: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function sentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// ── Validation issues ──

const LOCATION_ROOTS = new Set(['body', 'query', 'path', 'header', 'cookie'])
const PYDANTIC_PREFIX = /^(value error|assertion failed),\s*/i

/** Pydantic's message, without its developer prefixes. */
export function cleanValidationMessage(message: string): string {
  const cleaned = message.replace(PYDANTIC_PREFIX, '').trim()
  if (/^field required$/i.test(cleaned)) return 'This field is required'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

const WORD_OVERRIDES: Record<string, string> = { id: 'ID', ids: 'IDs', ip: 'IP', url: 'URL', api: 'API', abac: 'ABAC' }

/** 'subject_user_id' -> 'Subject user ID'; 'role_ids.0' -> 'Role IDs #1'; nested paths join with ' › '. */
export function humanizeFieldPath(path: string): string {
  if (!path) return ''
  const parts: string[] = []
  for (const segment of path.split('.')) {
    if (/^\d+$/.test(segment)) {
      const last = parts.pop() ?? ''
      parts.push(`${last} #${Number(segment) + 1}`.trim())
      continue
    }
    const words = segment.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_\s-]+/).filter(Boolean)
      .map(word => WORD_OVERRIDES[word.toLowerCase()] ?? word.toLowerCase())
    const phrase = words.join(' ')
    parts.push(phrase.charAt(0).toUpperCase() + phrase.slice(1))
  }
  return parts.join(' › ')
}

function issuePath(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  const segments = loc.filter((s): s is string | number => typeof s === 'string' || typeof s === 'number').map(String)
  if (segments.length && LOCATION_ROOTS.has(segments[0]!)) segments.shift()
  return segments.join('.')
}

function issuesFromArray(value: unknown): ApiIssue[] {
  if (!Array.isArray(value)) return []
  const issues: ApiIssue[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const raw = text(item.msg) ?? text(item.message)
    if (!raw) continue
    const path = issuePath(item.loc) || (text(item.field) ?? '')
    issues.push({ path, label: humanizeFieldPath(path), message: cleanValidationMessage(raw) })
  }
  return issues
}

/**
 * Error codes that always concern one input, for errors that do not name a field themselves.
 * Forms whose field is called differently map it with `fieldMap` (e.g. password -> new_password).
 */
export const CODE_FIELDS: Record<string, string> = {
  INVALID_PASSWORD: 'password',
  USER_ALREADY_EXISTS: 'email'
}

function collectIssues(data: ApiErrorPayload, details: Record<string, unknown>, serverMessage: string | null, code: string | null): { issues: ApiIssue[], fromArray: boolean } {
  const arrays = [data.detail, details.errors, isRecord(data.detail) ? data.detail.errors : undefined]
  for (const candidate of arrays) {
    const issues = issuesFromArray(candidate)
    if (issues.length) return { issues, fromArray: true }
  }
  // Library errors that name the offending field(s): InvalidInputError(details={field|fields}).
  const message = serverMessage ? cleanValidationMessage(serverMessage) : ''
  const fields = [text(details.field), ...stringList(details.fields)].filter((f): f is string => Boolean(f))
  if (message && fields.length) {
    return { issues: fields.map(path => ({ path, label: humanizeFieldPath(path), message })), fromArray: false }
  }
  const codeField = code ? CODE_FIELDS[code] : undefined
  if (message && codeField) return { issues: [{ path: codeField, label: humanizeFieldPath(codeField), message }], fromArray: false }
  return { issues: [], fromArray: false }
}

// ── Payload reading ──

function payloadDetails(data: ApiErrorPayload | null): Record<string, unknown> {
  if (!data) return {}
  if (isRecord(data.details)) return data.details
  if (isRecord(data.detail)) return data.detail
  return {}
}

function readMessage(value: unknown): string | null {
  if (typeof value === 'string') return text(value)
  if (Array.isArray(value)) {
    const first = issuesFromArray(value)[0]
    return first ? (first.path ? `${first.path}: ${first.message}` : first.message) : null
  }
  if (!isRecord(value)) return null
  return text(value.detail) ?? text(value.message) ?? readMessage(value.errors) ?? readMessage(value.details)
}

/** The API's own message in any envelope (developer text; prefer normalizeApiError().message). */
export function getApiErrorMessageFromPayload(payload: ApiErrorPayload | null | undefined): string | null {
  if (!payload) return null
  return readMessage(payload.detail) ?? readMessage(payload.details) ?? text(payload.message)
}

const GENERIC_ENVELOPE_CODES = new Set(['HTTP_ERROR'])

function readCode(data: ApiErrorPayload | null, details: Record<string, unknown>): string | null {
  if (!data) return null
  const envelope = text(data.error)
  if (envelope && !GENERIC_ENVELOPE_CODES.has(envelope)) return envelope
  const nested = text(details.code) ?? text(details.error_code) ?? text(details.error)
    ?? (isRecord(data.detail) ? text(data.detail.code) ?? text(data.detail.error) : null)
    ?? text(data.code)
  return nested ?? envelope
}

function readRetryAfter(error: ApiError, details: Record<string, unknown>): number | null {
  const data = error.data
  const candidates = [details.retry_after_seconds, isRecord(data) ? data.retry_after_seconds : undefined]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.ceil(value))
  }
  return error.retryAfterSeconds != null && Number.isFinite(error.retryAfterSeconds) ? Math.max(1, Math.ceil(error.retryAfterSeconds)) : null
}

/** Seconds from a Retry-After header value (delta-seconds or an HTTP date); null when unusable. */
export function parseRetryAfterHeader(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(1, Math.ceil(Number(trimmed)))
  const at = Date.parse(trimmed)
  return Number.isNaN(at) ? null : Math.max(1, Math.ceil((at - now) / 1000))
}

// ── Classification and copy ──

function kindFromStatus(status: number): ApiFailureKind {
  if (status === 400 || status === 413 || status === 422) return 'validation'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'not_found'
  if (status === 408) return 'timeout'
  if (status === 409 || status === 412 || status === 423) return 'conflict'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  return 'unknown'
}

function kindFromCode(code: string | null): ApiFailureKind | null {
  if (!code) return null
  if (/_NOT_FOUND$/.test(code)) return 'not_found'
  if (/_ALREADY_EXISTS$/.test(code) || code === 'INTEGRITY_ERROR') return 'conflict'
  if (code === 'RATE_LIMIT_EXCEEDED') return 'rate_limited'
  return null
}

/**
 * User-facing copy that replaces the library's developer messages. Keyed by the backend's
 * stable error code; codes not listed keep the API's own message, which the library writes as
 * a sentence already.
 */
export const ERROR_COPY: Record<string, string> = {
  VALIDATION_ERROR: 'Some fields need attention.',
  INTEGRITY_ERROR: 'This conflicts with an existing record, for example a duplicate name.',
  INTERNAL_SERVER_ERROR: 'The auth API hit an unexpected error.',
  DATABASE_ERROR: 'The auth API could not reach its database.',
  REDIS_ERROR: 'The auth API could not reach its cache.',
  CONFIGURATION_ERROR: 'The auth API is misconfigured for this request.',
  AUTH_INFRASTRUCTURE_UNAVAILABLE: 'A service the auth API depends on is unavailable.'
}

/** Copy per failure kind, used when the API gives nothing more specific. */
export const KIND_COPY: Record<ApiFailureKind, string> = {
  validation: 'The request was refused as invalid.',
  forbidden: 'You don\'t have permission to do this. Your access may have changed, so the console has refreshed your permissions.',
  not_found: 'It no longer exists, or you no longer have access to it.',
  conflict: 'This conflicts with the current state. Refresh and try again.',
  rate_limited: 'Too many requests. Try again shortly.',
  unauthorized: 'The request was not authorized.',
  server: 'The auth API hit an unexpected error.',
  network: 'Can\'t reach the auth API. Check your connection and try again.',
  timeout: 'The auth API did not respond in time.',
  unknown: 'Something went wrong. Try again; if it keeps happening, reload the page.'
}

// Route-level answers from FastAPI/Starlette, not the library: the endpoint itself is missing or
// the method is wrong, which means the console and the API disagree about the contract.
const ROUTE_MISS_MESSAGES = new Set(['not found', 'method not allowed'])
const GENERIC_FORBIDDEN = /^(insufficient permissions|forbidden|permission denied|not enough permissions|not authorized)\.?$/i
const GENERIC_SERVER = /^(internal server error|request failed|bad gateway|service unavailable|gateway timeout)\.?$/i

function retrySentence(seconds: number | null): string {
  return seconds ? `Too many requests. Try again in ${plural(seconds, 'second')}.` : KIND_COPY.rate_limited
}

function validationSummary(issues: ApiIssue[], fromArray: boolean, serverMessage: string | null): string {
  if (!fromArray && serverMessage) return sentence(cleanValidationMessage(serverMessage))
  const lines = issues.map(issue => (issue.label ? `${issue.label}: ${sentence(issue.message)}` : sentence(issue.message)))
  return lines.join(' ')
}

function permissionList(names: string[]) {
  return names.join(', ')
}

export function normalizeApiError(error: unknown): NormalizedApiError {
  const base: NormalizedApiError = {
    kind: 'unknown',
    status: 0,
    code: null,
    message: KIND_COPY.unknown,
    details: {},
    issues: [],
    fieldErrors: {},
    missingPermissions: [],
    requiredPermissions: [],
    retryAfterSeconds: null,
    sessionEnded: false,
    transient: false,
    generic: true
  }
  if (!(error instanceof ApiError)) return base

  const data = error.data
  const details = payloadDetails(data)
  const code = readCode(data, details)
  const serverMessage = getApiErrorMessageFromPayload(data)
  const common = {
    ...base,
    status: error.status,
    code,
    details,
    transient: isTransientApiError(error),
    retryAfterSeconds: readRetryAfter(error, details),
    missingPermissions: stringList(details.missing_permissions),
    requiredPermissions: stringList(details.required_permissions)
  }

  if (error.kind === 'session_ended') {
    return { ...common, kind: 'unauthorized', sessionEnded: true, message: error.message || KIND_COPY.unauthorized, generic: false }
  }
  if (error.kind === 'network' || error.kind === 'timeout') {
    return { ...common, kind: error.kind, message: error.message || KIND_COPY[error.kind], generic: !error.message }
  }

  const kind = kindFromCode(code) ?? kindFromStatus(error.status)
  // Validation errors, plus conflicts that concern one input (a duplicate email), carry issues.
  const withIssues = kind === 'validation' || (kind === 'conflict' && Boolean(code && CODE_FIELDS[code]))
  const { issues, fromArray } = withIssues ? collectIssues(data ?? {}, details, serverMessage, code) : { issues: [], fromArray: false }
  const fieldErrors: Record<string, string> = {}
  for (const issue of issues) if (issue.path && !(issue.path in fieldErrors)) fieldErrors[issue.path] = issue.message
  const normalized = { ...common, kind, issues, fieldErrors }

  // A message the console wrote itself (e.g. a renewal that could not complete) is kept.
  if (error.source === 'client') {
    return { ...normalized, message: error.message || KIND_COPY[kind], generic: !error.message }
  }

  const specific = (message: string) => ({ ...normalized, message, generic: false })
  const generic = (message: string) => ({ ...normalized, message, generic: true })
  const withStatus = (message: string) => `${message.replace(/\.$/, '')} (HTTP ${error.status}).`
  const lowered = serverMessage?.toLowerCase().replace(/\.$/, '') ?? ''

  if (error.status === 404 || error.status === 405) {
    if (!code || code === 'HTTP_ERROR') {
      if (ROUTE_MISS_MESSAGES.has(lowered)) {
        return generic(`The auth API does not provide this endpoint (HTTP ${error.status}). The console and the API may be on different versions.`)
      }
    }
  }

  switch (kind) {
    case 'validation': {
      if (issues.length) return specific(validationSummary(issues, fromArray, serverMessage))
      if (code && ERROR_COPY[code]) return generic(ERROR_COPY[code])
      return serverMessage ? specific(sentence(serverMessage)) : generic(KIND_COPY.validation)
    }
    case 'forbidden': {
      if (normalized.missingPermissions.length) {
        const lead = serverMessage && !/^permission denied: missing/i.test(serverMessage) ? serverMessage.replace(/\.$/, '') : 'You don\'t have every permission this needs'
        return specific(`${lead}. Missing: ${permissionList(normalized.missingPermissions)}.`)
      }
      if (normalized.requiredPermissions.length) {
        return specific(`You need one of these permissions: ${permissionList(normalized.requiredPermissions)}.`)
      }
      if (!serverMessage || GENERIC_FORBIDDEN.test(serverMessage)) return generic(KIND_COPY.forbidden)
      return specific(sentence(serverMessage))
    }
    case 'not_found': {
      if (!serverMessage || ROUTE_MISS_MESSAGES.has(lowered)) return generic(KIND_COPY.not_found)
      return specific(`${sentence(serverMessage)} It may have been deleted, or you no longer have access to it.`)
    }
    case 'conflict': {
      if (code && ERROR_COPY[code]) return generic(ERROR_COPY[code])
      return serverMessage ? specific(sentence(serverMessage)) : generic(KIND_COPY.conflict)
    }
    case 'rate_limited':
      return generic(retrySentence(normalized.retryAfterSeconds))
    case 'unauthorized':
      return serverMessage ? specific(sentence(serverMessage)) : generic(KIND_COPY.unauthorized)
    case 'server': {
      const unavailable = error.status === 502 || error.status === 503 || error.status === 504
      if (code && ERROR_COPY[code]) return generic(`${withStatus(ERROR_COPY[code])} ${unavailable ? 'Try again in a moment.' : 'Try again; if it keeps happening, check the API logs.'}`)
      if (!serverMessage || GENERIC_SERVER.test(serverMessage)) {
        return generic(unavailable
          ? `The auth API is temporarily unavailable (HTTP ${error.status}). Try again in a moment.`
          : `${withStatus(KIND_COPY.server)} Try again; if it keeps happening, check the API logs.`)
      }
      return specific(withStatus(serverMessage))
    }
    case 'timeout':
      return generic(KIND_COPY.timeout)
    default:
      return serverMessage
        ? specific(`${sentence(serverMessage).replace(/\.$/, '')} (HTTP ${error.status}).`)
        : generic(`The auth API answered HTTP ${error.status}.`)
  }
}

/** One human sentence for any error (query "Could not load …" alerts, inline errors). */
export function getApiErrorMessage(error: unknown, fallback = KIND_COPY.unknown): string {
  if (!(error instanceof ApiError)) return fallback
  return normalizeApiError(error).message || fallback
}

/**
 * Auth-request error -> toast title/description, with the cooldown for 429s. Kept for the auth
 * flows; useApiAction applies the same copy to every mutation.
 */
export function describeAuthError(error: unknown, fallbackTitle: string): { title: string, description: string } {
  const normalized = normalizeApiError(error)
  if (normalized.kind === 'rate_limited') return { title: 'Please wait a moment', description: normalized.message }
  return { title: fallbackTitle, description: getApiErrorMessage(error) }
}

// ── Forms ──

export type ApiFormError = { name: string, message: string }

/**
 * The form field a wire path belongs to: its `fieldMap` entry; else the entry for its first
 * segment, since Pydantic reports a member of a union or list under the field (`value.str`,
 * `role_ids.0`); else the path itself (UForm names nested fields by dotted path). `null` when the
 * issue has no path or the map keeps it off the fields.
 */
export function formFieldFor(path: string, fieldMap: Record<string, string | null> = {}): string | null {
  if (!path) return null
  if (path in fieldMap) return fieldMap[path] ?? null
  const head = path.split('.')[0]!
  if (head !== path && head in fieldMap) return fieldMap[head] ?? null
  return path
}

/**
 * The issues as UForm errors. `fieldMap` renames wire paths (or their first segment) to form
 * field names; a mapped value of `null` drops that path from field mapping (it is then listed with
 * the unmatched issues). Issues without a path are returned in `unmatched` for the dialog's alert.
 */
export function apiFormErrors(normalized: Pick<NormalizedApiError, 'issues'>, fieldMap: Record<string, string | null> = {}): { fieldErrors: ApiFormError[], unmatched: ApiIssue[] } {
  const fieldErrors: ApiFormError[] = []
  const unmatched: ApiIssue[] = []
  for (const issue of normalized.issues) {
    const mapped = formFieldFor(issue.path, fieldMap)
    if (mapped) fieldErrors.push({ name: mapped, message: issue.message })
    else unmatched.push(issue)
  }
  return { fieldErrors, unmatched }
}
