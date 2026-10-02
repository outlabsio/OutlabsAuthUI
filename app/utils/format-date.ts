// The console's one date formatter. Every timestamp the API returns (`*_at`, `valid_*`,
// `expires_at`, audit `occurred_at`) is shown through these helpers, usually via
// <AppTimestamp>, so lists, detail pages and cards read the same way:
// - absolute: medium date + short time in the viewer's locale and time zone
//   ("Sep 30, 2026, 10:32 AM"); date-only values use formatDate ("Sep 30, 2026");
// - relative for recent values ("5 minutes ago", "in 3 days"), with the absolute value kept
//   reachable (AppTimestamp puts it in a UTooltip and in screen-reader text);
// - a single fallback for missing values ('—' by default, 'Never' where that reads better).
// Pure functions: `now`, `locale` and `timeZone` are parameters so tests are deterministic.

export type DateInput = string | number | Date | null | undefined

export type DateFormatOptions = {
  // BCP 47 locale; undefined = the viewer's locale.
  locale?: string
  // IANA time zone; undefined = the viewer's time zone.
  timeZone?: string
  // Returned for a missing or unparseable value.
  fallback?: string
}

export type RelativeMode = 'auto' | 'always' | 'never'

export type TimestampParts = {
  // What to render: relative when recent (mode 'auto'), absolute otherwise.
  label: string
  // Medium date + short time; what a tooltip or screen-reader suffix shows.
  absolute: string
  // Full date and time with seconds and time zone, for the tooltip.
  full: string
  // ISO 8601 for <time datetime>, or null when the value is missing.
  iso: string | null
  // Whether `label` is the relative form.
  relative: boolean
}

export const EMPTY_DATE = '—'

// Values within this window of `now` (past or future) read as relative time in 'auto' mode.
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// A Date for any accepted input, or null. Strings are ISO 8601 from the API, often with
// microseconds ('2026-09-30T10:32:43.955005Z'); fractional seconds past milliseconds are not
// part of the ECMAScript date format, so they are trimmed before parsing.
export function parseDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const normalized = value.trim().replace(/(\.\d{3})\d+/, '$1')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

// "Sep 30, 2026, 10:32 AM"
export function formatDateTime(value: DateInput, options: DateFormatOptions = {}): string {
  const date = parseDate(value)
  if (!date) return options.fallback ?? EMPTY_DATE
  return new Intl.DateTimeFormat(options.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: options.timeZone }).format(date)
}

// "Sep 30, 2026" — for values where the time of day carries no meaning.
export function formatDate(value: DateInput, options: DateFormatOptions = {}): string {
  const date = parseDate(value)
  if (!date) return options.fallback ?? EMPTY_DATE
  return new Intl.DateTimeFormat(options.locale, { dateStyle: 'medium', timeZone: options.timeZone }).format(date)
}

// "Tuesday, September 30, 2026 at 10:32:43 AM GMT-3" — the unambiguous form for tooltips.
export function formatFullDateTime(value: DateInput, options: DateFormatOptions = {}): string {
  const date = parseDate(value)
  if (!date) return options.fallback ?? EMPTY_DATE
  return new Intl.DateTimeFormat(options.locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    timeZone: options.timeZone
  }).format(date)
}

// "just now", "5 minutes ago", "in 3 hours", "yesterday", "in 2 days", "3 weeks ago".
export function formatRelativeTime(value: DateInput, now: number = Date.now(), options: Pick<DateFormatOptions, 'locale' | 'fallback'> = {}): string {
  const date = parseDate(value)
  if (!date) return options.fallback ?? EMPTY_DATE
  const diff = date.getTime() - now
  const abs = Math.abs(diff)
  if (abs < 45 * 1000) return 'just now'
  const rtf = new Intl.RelativeTimeFormat(options.locale, { numeric: 'auto' })
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute')
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour')
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day')
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / (7 * DAY)), 'week')
  if (abs < 365 * DAY) return rtf.format(Math.round(diff / (30 * DAY)), 'month')
  return rtf.format(Math.round(diff / (365 * DAY)), 'year')
}

export function isRecent(value: DateInput, now: number = Date.now(), windowMs: number = RECENT_WINDOW_MS): boolean {
  const date = parseDate(value)
  return date !== null && Math.abs(date.getTime() - now) < windowMs
}

// Everything a timestamp cell needs, in one call.
export function timestampParts(
  value: DateInput,
  options: DateFormatOptions & { now?: number, mode?: RelativeMode, dateOnly?: boolean } = {}
): TimestampParts {
  const date = parseDate(value)
  const fallback = options.fallback ?? EMPTY_DATE
  if (!date) return { label: fallback, absolute: fallback, full: fallback, iso: null, relative: false }
  const now = options.now ?? Date.now()
  const mode = options.mode ?? 'auto'
  const absolute = options.dateOnly ? formatDate(date, options) : formatDateTime(date, options)
  const full = options.dateOnly ? formatDate(date, options) : formatFullDateTime(date, options)
  const relative = mode === 'always' || (mode === 'auto' && isRecent(date, now))
  return {
    label: relative ? formatRelativeTime(date, now, options) : absolute,
    absolute,
    full,
    iso: date.toISOString(),
    relative
  }
}
