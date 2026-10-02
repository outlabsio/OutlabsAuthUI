import { describe, expect, it } from 'vitest'
import {
  listQueryKeys,
  mergeListQuery,
  parseListQuery,
  parsePageParam,
  sameListValues,
  sameRouteQuery,
  serializeListQuery,
  type ListQuerySpec
} from '~/utils/list-query'

type Filters = { resource: string, origin: 'all' | 'system' | 'custom', orphaned: boolean, limit: number }
const spec: ListQuerySpec<Filters> = {
  filters: { resource: '', origin: 'all', orphaned: false, limit: 25 },
  allowed: { origin: ['all', 'system', 'custom'] }
}

describe('parseListQuery', () => {
  it('returns the defaults for an empty query', () => {
    expect(parseListQuery({}, spec)).toEqual({ search: '', page: 1, filters: spec.filters })
  })

  it('reads search, page and typed filters', () => {
    expect(parseListQuery({ q: '  api ', page: '3', resource: 'user', origin: 'custom', orphaned: 'true', limit: '50' }, spec)).toEqual({
      search: 'api',
      page: 3,
      filters: { resource: 'user', origin: 'custom', orphaned: true, limit: 50 }
    })
  })

  it('falls back to defaults for invalid values', () => {
    expect(parseListQuery({ page: '0', origin: 'bogus', orphaned: 'maybe', limit: 'x' }, spec).filters).toEqual(spec.filters)
    expect(parseListQuery({ page: '-2' }, spec).page).toBe(1)
    expect(parseListQuery({ page: '2.5' }, spec).page).toBe(1)
  })

  it('takes the first value of repeated keys and ignores null', () => {
    expect(parseListQuery({ resource: ['role', 'user'], q: null }, spec)).toMatchObject({ search: '', filters: { resource: 'role' } })
  })

  it('supports custom keys and disabled search', () => {
    const custom: ListQuerySpec<{ status: string }> = { filters: { status: 'active' }, searchParam: null, pageParam: 'p' }
    expect(parseListQuery({ q: 'x', p: '2', status: 'all' }, custom)).toEqual({ search: '', page: 2, filters: { status: 'all' } })
    expect(listQueryKeys(custom)).toEqual(['p', 'status'])
  })
})

describe('serializeListQuery', () => {
  it('writes only non-default values', () => {
    expect(serializeListQuery({ search: '', page: 1, filters: spec.filters }, spec)).toEqual({})
    expect(serializeListQuery({ search: ' api ', page: 2, filters: { ...spec.filters, origin: 'system', orphaned: true } }, spec)).toEqual({
      q: 'api',
      page: '2',
      origin: 'system',
      orphaned: 'true'
    })
  })

  it('round-trips through parse', () => {
    const values = { search: 'x y', page: 4, filters: { resource: 'api_key', origin: 'custom' as const, orphaned: true, limit: 10 } }
    expect(parseListQuery(serializeListQuery(values, spec), spec)).toEqual(values)
  })
})

describe('mergeListQuery', () => {
  it('keeps keys owned by other features and replaces its own', () => {
    const next = mergeListQuery({ entity: 'e1', q: 'old', page: '5', origin: 'system' }, { search: '', page: 1, filters: { ...spec.filters, resource: 'user' } }, spec)
    expect(next).toEqual({ entity: 'e1', resource: 'user' })
  })
})

describe('comparisons', () => {
  it('compares values', () => {
    const a = { search: 'a', page: 1, filters: spec.filters }
    expect(sameListValues(a, { ...a, filters: { ...spec.filters } })).toBe(true)
    expect(sameListValues(a, { ...a, page: 2 })).toBe(false)
    expect(sameListValues(a, { ...a, filters: { ...spec.filters, orphaned: true } })).toBe(false)
  })

  it('compares route queries regardless of key order and value types', () => {
    expect(sameRouteQuery({ a: '1', b: 'x' }, { b: 'x', a: 1 })).toBe(true)
    expect(sameRouteQuery({ a: '1' }, { a: '1', b: undefined })).toBe(true)
    expect(sameRouteQuery({ a: '1' }, { a: '2' })).toBe(false)
  })
})

describe('parsePageParam', () => {
  it.each([[undefined, 1], ['', 1], ['1', 1], ['12', 12], ['abc', 1], ['99999999999999999999', 1]])('%j -> %d', (raw, expected) => {
    expect(parsePageParam(raw)).toBe(expected)
  })
})
