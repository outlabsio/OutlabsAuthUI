import { describe, expect, it } from 'vitest'
import {
  EMPTY_DATE,
  formatDate,
  formatDateTime,
  formatFullDateTime,
  formatRelativeTime,
  isRecent,
  parseDate,
  timestampParts
} from '~/utils/format-date'

const opts = { locale: 'en-US', timeZone: 'UTC' }
const NOW = Date.parse('2026-09-30T12:00:00Z')

describe('parseDate', () => {
  it('parses API timestamps with microseconds', () => {
    expect(parseDate('2026-09-30T10:32:43.955005Z')?.toISOString()).toBe('2026-09-30T10:32:43.955Z')
  })

  it.each([null, undefined, '', 'not a date', Number.NaN])('returns null for %j', (value) => {
    expect(parseDate(value as never)).toBeNull()
  })

  it('accepts Date and epoch values', () => {
    expect(parseDate(new Date(NOW))?.getTime()).toBe(NOW)
    expect(parseDate(NOW)?.getTime()).toBe(NOW)
  })
})

describe('absolute formats', () => {
  it('formats medium date + short time', () => {
    expect(formatDateTime('2026-09-30T10:32:43.955005Z', opts)).toBe('Sep 30, 2026, 10:32 AM')
  })

  it('formats a date alone', () => {
    expect(formatDate('2026-09-30T10:32:43Z', opts)).toBe('Sep 30, 2026')
  })

  it('formats the full tooltip form with seconds and zone', () => {
    expect(formatFullDateTime('2026-09-30T10:32:43Z', opts)).toBe('Wednesday, September 30, 2026 at 10:32:43 AM UTC')
  })

  it('uses the fallback for missing values', () => {
    expect(formatDateTime(null, opts)).toBe(EMPTY_DATE)
    expect(formatDateTime(undefined, { ...opts, fallback: 'Never' })).toBe('Never')
    expect(formatDate('garbage', opts)).toBe(EMPTY_DATE)
  })

  it('honours the time zone', () => {
    expect(formatDateTime('2026-09-30T02:00:00Z', { locale: 'en-US', timeZone: 'America/Argentina/Buenos_Aires' })).toBe('Sep 29, 2026, 11:00 PM')
  })
})

describe('relative time', () => {
  it.each([
    ['2026-09-30T11:59:40Z', 'just now'],
    ['2026-09-30T12:00:20Z', 'just now'],
    ['2026-09-30T11:55:00Z', '5 minutes ago'],
    ['2026-09-30T09:00:00Z', '3 hours ago'],
    ['2026-09-30T15:00:00Z', 'in 3 hours'],
    ['2026-09-29T12:00:00Z', 'yesterday'],
    ['2026-10-03T12:00:00Z', 'in 3 days'],
    ['2026-09-16T12:00:00Z', '2 weeks ago'],
    ['2026-06-30T12:00:00Z', '3 months ago'],
    ['2024-09-30T12:00:00Z', '2 years ago']
  ])('%s -> %s', (value, expected) => {
    expect(formatRelativeTime(value, NOW, { locale: 'en-US' })).toBe(expected)
  })

  it('treats a 7-day window as recent, in both directions', () => {
    expect(isRecent('2026-09-24T12:00:01Z', NOW)).toBe(true)
    expect(isRecent('2026-10-07T11:59:59Z', NOW)).toBe(true)
    expect(isRecent('2026-09-23T12:00:00Z', NOW)).toBe(false)
    expect(isRecent(null, NOW)).toBe(false)
  })
})

describe('timestampParts', () => {
  it('is relative for recent values and keeps the absolute form', () => {
    const parts = timestampParts('2026-09-30T11:55:00.123456Z', { ...opts, now: NOW })
    expect(parts).toEqual({
      label: '5 minutes ago',
      absolute: 'Sep 30, 2026, 11:55 AM',
      full: 'Wednesday, September 30, 2026 at 11:55:00 AM UTC',
      iso: '2026-09-30T11:55:00.123Z',
      relative: true
    })
  })

  it('is absolute for older values', () => {
    const parts = timestampParts('2026-01-02T08:05:00Z', { ...opts, now: NOW })
    expect(parts.label).toBe('Jan 2, 2026, 8:05 AM')
    expect(parts.relative).toBe(false)
  })

  it('respects the mode', () => {
    expect(timestampParts('2026-01-02T08:05:00Z', { ...opts, now: NOW, mode: 'always' }).label).toBe('9 months ago')
    expect(timestampParts('2026-09-30T11:55:00Z', { ...opts, now: NOW, mode: 'never' }).label).toBe('Sep 30, 2026, 11:55 AM')
  })

  it('formats date-only values without a time', () => {
    const parts = timestampParts('2026-01-02T08:05:00Z', { ...opts, now: NOW, dateOnly: true })
    expect(parts.label).toBe('Jan 2, 2026')
    expect(parts.full).toBe('Jan 2, 2026')
  })

  it('falls back for missing values', () => {
    expect(timestampParts(null, { fallback: 'Never' })).toEqual({ label: 'Never', absolute: 'Never', full: 'Never', iso: null, relative: false })
  })
})
