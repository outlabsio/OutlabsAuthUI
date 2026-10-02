// Pure helpers behind useRequestCooldown: how long to wait before asking the auth API to send
// another code or link, and how many seconds a rate-limited (429) answer asked the console to
// wait. The backend limits sign-in codes, magic links and reset links to a few requests per
// identifier per window; without a local cooldown an impatient Resend locks the user out for
// the rest of that window.

// Wait after every successful send (one minute per identifier).
export const DEFAULT_REQUEST_COOLDOWN_SECONDS = 60

export type CooldownEntries = Record<string, number>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function positiveSeconds(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? Math.ceil(number) : null
}

/** Seconds from a Retry-After header value (delta-seconds or an HTTP date); null when absent or past. */
export function parseRetryAfterHeader(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return positiveSeconds(trimmed)
  const date = Date.parse(trimmed)
  return Number.isNaN(date) ? null : positiveSeconds((date - now) / 1000)
}

/**
 * The wait a rate-limited answer asked for, in whole seconds. The library's global error
 * handler nests it under `details` ({ error, message, details: { retry_after_seconds } }); a
 * host in `auth_only` mode returns FastAPI's `{ detail: { retry_after_seconds } }`; a
 * RateLimitError may put it at the top level. The Retry-After header is the fallback (the
 * browser only exposes it when the API lists it in Access-Control-Expose-Headers).
 * Accepts anything shaped like ApiError: `{ data, retryAfterSeconds }` (the client parses the
 * header into ApiError.retryAfterSeconds), or a raw header value as `{ data, retryAfter }`.
 */
export function retryAfterSecondsFrom(error: unknown, now = Date.now()): number | null {
  if (!isRecord(error) && !(error instanceof Error)) return null
  const { data, retryAfter, retryAfterSeconds } = error as { data?: unknown, retryAfter?: unknown, retryAfterSeconds?: unknown }
  const payload = isRecord(data) ? data : {}
  for (const source of [payload.details, payload.detail, payload]) {
    if (!isRecord(source)) continue
    const seconds = positiveSeconds(source.retry_after_seconds)
    if (seconds) return seconds
  }
  return positiveSeconds(retryAfterSeconds) ?? parseRetryAfterHeader(typeof retryAfter === 'string' ? retryAfter : null, now)
}

/** Whether a failure is the API's "too many requests" answer. */
export function isRateLimitedError(error: unknown): boolean {
  return (isRecord(error) || error instanceof Error) && (error as { status?: unknown }).status === 429
}

/** Whole seconds left until `expiresAt` (0 when unset or past). */
export function cooldownSecondsLeft(expiresAt: number | undefined, now: number): number {
  if (!expiresAt || expiresAt <= now) return 0
  return Math.ceil((expiresAt - now) / 1000)
}

/** One cooldown per kind of request and identifier (the backend limits per identifier). */
export function cooldownKey(kind: string, identifier: string): string {
  return `${kind}:${identifier.trim().toLowerCase()}`
}

/** Drops expired entries. */
export function pruneCooldowns(entries: CooldownEntries, now: number): CooldownEntries {
  return Object.fromEntries(Object.entries(entries).filter(([, expiresAt]) => expiresAt > now))
}

/** Reads persisted cooldowns (sessionStorage), ignoring anything malformed or expired. */
export function parseCooldownStore(raw: string | null, now: number): CooldownEntries {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}
    const entries: CooldownEntries = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) entries[key] = value
    }
    return pruneCooldowns(entries, now)
  } catch {
    return {}
  }
}

/** "Resend code" → "Resend code in 42s" while cooling down. */
export function cooldownLabel(label: string, secondsLeft: number): string {
  return secondsLeft > 0 ? `${label} in ${secondsLeft}s` : label
}
