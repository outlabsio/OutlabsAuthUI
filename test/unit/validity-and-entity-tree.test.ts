import { describe, expect, it } from 'vitest'
import { buildEntityTree, filterEntityTree } from '~/utils/entity-tree'
import { endOfDayIso, INCOMPLETE_DAY, isDateInput, startOfDayIso, toDateInput, validityWindowError } from '~/utils/validity'
import type { Entity } from '~/types/entity'

describe('validity window', () => {
  it.each([
    ['', '', ''],
    ['2026-01-10', '', ''],
    ['', '2026-01-10', ''],
    ['2026-01-10', '2026-01-10', ''],
    ['2026-01-10', '2026-02-01', '']
  ])('accepts from=%j until=%j', (from, until, expected) => {
    expect(validityWindowError(from, until)).toBe(expected)
  })

  it('rejects an until before from', () => {
    expect(validityWindowError('2026-02-01', '2026-01-31')).toMatch(/on or after/)
  })

  it('leaves a partly typed side to its own field, not the window order', () => {
    // 'incomplete' sorts after every year as a string: it must not read as a day.
    expect(validityWindowError(INCOMPLETE_DAY, '2026-01-31')).toBe('')
    expect(validityWindowError('2026-02-01', INCOMPLETE_DAY)).toBe('')
  })

  it('maps ISO datetimes to the day they fall on in the given time zone', () => {
    expect(toDateInput('2026-03-04T10:00:00Z', 'UTC')).toBe('2026-03-04')
    // 02:59 UTC on the 5th is still the 4th in Buenos Aires (UTC-3) and already the 5th in Tokyo.
    expect(toDateInput('2026-03-05T02:59:59.999Z', 'America/Argentina/Buenos_Aires')).toBe('2026-03-04')
    expect(toDateInput('2026-03-04T15:00:00Z', 'Asia/Tokyo')).toBe('2026-03-05')
    expect(toDateInput(null)).toBe('')
    expect(toDateInput(undefined)).toBe('')
    expect(toDateInput('not a date')).toBe('')
  })
})

describe('validity days in the admin\'s time zone (F-113)', () => {
  it('starts a "from" day at local midnight', () => {
    expect(startOfDayIso('2026-10-05', 'America/Argentina/Buenos_Aires')).toBe('2026-10-05T03:00:00.000Z')
    expect(startOfDayIso('2026-10-05', 'UTC')).toBe('2026-10-05T00:00:00.000Z')
    expect(startOfDayIso('2026-10-05', 'Asia/Kolkata')).toBe('2026-10-04T18:30:00.000Z')
  })

  it('ends an "until" day at the last millisecond of that local day, not at UTC midnight', () => {
    // "Valid until Oct 5" in the Americas must still work on the evening of Oct 5.
    expect(endOfDayIso('2026-10-05', 'America/Argentina/Buenos_Aires')).toBe('2026-10-06T02:59:59.999Z')
    expect(endOfDayIso('2026-10-05', 'UTC')).toBe('2026-10-05T23:59:59.999Z')
    expect(endOfDayIso('2026-10-05', 'Pacific/Auckland')).toBe('2026-10-05T10:59:59.999Z')
  })

  it('follows daylight-saving changes (the local day is 23 or 25 hours long)', () => {
    // US DST starts on 2026-03-08: the day ends at 23:59:59.999 EDT (UTC-4).
    expect(startOfDayIso('2026-03-08', 'America/New_York')).toBe('2026-03-08T05:00:00.000Z')
    expect(endOfDayIso('2026-03-08', 'America/New_York')).toBe('2026-03-09T03:59:59.999Z')
  })

  it('round-trips a day through the instant it is saved as', () => {
    for (const zone of ['America/Los_Angeles', 'UTC', 'Europe/Madrid', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
      expect(toDateInput(endOfDayIso('2026-12-31', zone), zone)).toBe('2026-12-31')
      expect(toDateInput(startOfDayIso('2026-01-01', zone), zone)).toBe('2026-01-01')
    }
  })

  it('never converts a partly typed day into an instant', () => {
    // Its field message is dateInput's (dialog-kit.test.ts); the window check skips it (above).
    expect(startOfDayIso(INCOMPLETE_DAY)).toBeNull()
    expect(endOfDayIso(INCOMPLETE_DAY)).toBeNull()
    expect(toDateInput(INCOMPLETE_DAY)).toBe('')
  })

  it('returns null for a blank or impossible day', () => {
    expect(startOfDayIso('')).toBeNull()
    expect(endOfDayIso('')).toBeNull()
    expect(endOfDayIso('2026-02-30')).toBeNull()
    expect(isDateInput('2026-02-28')).toBe(true)
    expect(isDateInput('2026-2-28')).toBe(false)
    expect(isDateInput('2026-02-30')).toBe(false)
  })
})

function entity(id: string, displayName: string, parent: string | null = null, extra: Partial<Entity> = {}): Entity {
  return {
    id,
    display_name: displayName,
    slug: displayName.toLowerCase().replace(/\s+/g, '-'),
    entity_type: 'office',
    parent_entity_id: parent,
    ...extra
  } as Entity
}

describe('entity tree', () => {
  const flat = [
    entity('b', 'Beta Office', 'root'),
    entity('root', 'Acme'),
    entity('a', 'Alpha Office', 'root'),
    entity('team', 'Closers', 'a', { entity_type: 'team' }),
    entity('other', 'Zenith')
  ]

  it('nests children under their parent and sorts every level by display name', () => {
    const tree = buildEntityTree(flat)
    expect(tree.map(n => n.id)).toEqual(['root', 'other'])
    expect(tree[0]!.children.map(n => n.id)).toEqual(['a', 'b'])
    expect(tree[0]!.children[0]!.children.map(n => n.id)).toEqual(['team'])
  })

  it('keeps ancestors of a deep match and expands them', () => {
    const { tree, expandedIds } = filterEntityTree(buildEntityTree(flat), 'closers')
    expect(tree.map(n => n.id)).toEqual(['root'])
    expect(tree[0]!.children.map(n => n.id)).toEqual(['a'])
    expect(expandedIds.sort()).toEqual(['a', 'root'])
  })

  it('matches on slug and type, and a blank term returns the tree untouched', () => {
    const roots = buildEntityTree(flat)
    expect(filterEntityTree(roots, '  ').tree).toBe(roots)
    expect(filterEntityTree(roots, 'team').tree[0]!.id).toBe('root')
    expect(filterEntityTree(roots, 'zenith').tree.map(n => n.id)).toEqual(['other'])
  })
})
