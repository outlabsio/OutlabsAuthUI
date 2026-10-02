import { fromDate, getLocalTimeZone, parseDate, toCalendarDate } from '@internationalized/date'

// Date-only fields shared by every "valid from / valid until" pair and by "suspended until".
// Forms bind calendar days as 'YYYY-MM-DD' strings ('' = not set, INCOMPLETE_DAY = partly typed;
// see AppDateField); the API stores instants. A day always means the whole day in the admin's time zone (the browser's):
//   - "from" days start at 00:00:00.000 local time (startOfDayIso);
//   - "until" days end at 23:59:59.999 local time (endOfDayIso), so access granted "until
//     Oct 5" still works all of Oct 5 where the admin is, instead of ending at UTC midnight
//     (Oct 4 in the evening across the Americas).
// Reading an instant back (toDateInput) uses the same time zone, so an unchanged date round-trips
// to the same day. Every caller goes through these helpers: fixing them fixes every form.

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/

/**
 * AppDateField's value while some of its month / day / year segments are typed and some are not.
 * It is never a day: the conversions below return null for it, and `dateInput` (schemas/common)
 * rejects it with INCOMPLETE_DAY_MESSAGE on its own field, so a half-typed date is never saved
 * as "not set".
 */
export const INCOMPLETE_DAY = 'incomplete'
export const INCOMPLETE_DAY_MESSAGE = 'Enter the whole date, or clear it.'

/** The admin's IANA time zone, e.g. "America/New_York". */
export function adminTimeZone(): string {
  return getLocalTimeZone()
}

/** True for a real calendar day in 'YYYY-MM-DD' form ('2026-02-30' is not). */
export function isDateInput(value: string): boolean {
  if (!DATE_INPUT.test(value)) return false
  try {
    return parseDate(value).toString() === value
  } catch {
    return false
  }
}

/** First instant of the day in `timeZone`, as ISO; null when blank or not a date. */
export function startOfDayIso(date: string, timeZone: string = adminTimeZone()): string | null {
  if (!isDateInput(date)) return null
  return parseDate(date).toDate(timeZone).toISOString()
}

/** Last instant (…:59.999) of the day in `timeZone`, as ISO; null when blank or not a date. */
export function endOfDayIso(date: string, timeZone: string = adminTimeZone()): string | null {
  if (!isDateInput(date)) return null
  const nextDay = parseDate(date).add({ days: 1 }).toDate(timeZone)
  return new Date(nextDay.getTime() - 1).toISOString()
}

/** The day an instant falls on in `timeZone`, as 'YYYY-MM-DD'; '' when absent or invalid. */
export function toDateInput(iso?: string | null, timeZone: string = adminTimeZone()): string {
  if (!iso) return ''
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return ''
  return toCalendarDate(fromDate(instant, timeZone)).toString()
}

/**
 * "until >= from" for a validity window (checkValidityWindow in schemas/common). Returns '' when
 * valid, or when either side is not a complete day (empty, or partly typed: `dateInput` reports
 * that on its own field).
 */
export function validityWindowError(from: string, until: string): string {
  if (!isDateInput(from) || !isDateInput(until)) return ''
  // Zero-padded ISO days compare chronologically as strings.
  return until < from ? 'Valid until must be on or after valid from.' : ''
}

/** Help text for an "until" day: when it ends and in which time zone. */
export function endOfDayHelp(timeZone: string = adminTimeZone()): string {
  return `Ends at the end of that day (${timeZone}).`
}

/** Help text for a "from" day. */
export function startOfDayHelp(timeZone: string = adminTimeZone()): string {
  return `Starts at the beginning of that day (${timeZone}).`
}
