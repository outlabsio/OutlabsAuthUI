import { describe, expect, it } from 'vitest'
import {
  apiKeyActionStates,
  apiKeyMenuItems,
  apiKeyState,
  apiKeyTypeLabel,
  expiresSoon,
  expiryDays,
  ineffectiveReasonText,
  isPastExpiry,
  isTerminalKey,
  KEY_INVENTORY_STATUS_ITEMS,
  KEY_INVENTORY_STATUSES,
  keyInventoryEmptyCopy,
  keyListEmptyCopy,
  rateLimitLabel,
  replacementExpiry,
  ROTATE_INEFFECTIVE_REASON,
  ROTATE_SUSPENDED_REASON,
  visibleKeys
} from '../../app/utils/api-keys'
import { personalKeySchema, rateLimitWire } from '../../app/schemas/api-key'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

describe('apiKeyState (F-027)', () => {
  it('reports a working key as Active', () => {
    expect(apiKeyState({ status: 'active', is_currently_effective: true, ineffective_reasons: [] }, NOW)).toEqual({ kind: 'active', label: 'Active', color: 'success', reasons: [] })
    // No key policy service on the server: the stored status stands.
    expect(apiKeyState({ status: 'active', is_currently_effective: null }, NOW).kind).toBe('active')
  })

  it('says a key past its expiry date has expired, although the server keeps it active', () => {
    const state = apiKeyState({ status: 'active', expires_at: iso(NOW - DAY), is_currently_effective: false, ineffective_reasons: ['key_expired'] }, NOW)
    expect(state).toMatchObject({ kind: 'expired', label: 'Expired', color: 'neutral' })
    expect(state.reasons).toEqual(['Its expiry date has passed.'])
    // Date alone is enough (an older response without effectiveness).
    expect(apiKeyState({ status: 'active', expires_at: iso(NOW - 1) }, NOW).kind).toBe('expired')
    expect(apiKeyState({ status: 'expired' }, NOW).kind).toBe('expired')
  })

  it('says an active key the server refuses is not in effect, with readable reasons', () => {
    const state = apiKeyState({ status: 'active', is_currently_effective: false, ineffective_reasons: ['owner_inactive', 'anchor_inactive'] }, NOW)
    expect(state).toMatchObject({ kind: 'ineffective', label: 'Not in effect', color: 'warning' })
    expect(state.reasons).toEqual([
      'The account that owns it cannot sign in (for example suspended, locked or deleted).',
      'The entity it is restricted to is inactive or archived.'
    ])
    expect(apiKeyState({ status: 'active', is_currently_effective: false, ineffective_reasons: [] }, NOW).reasons).toEqual(['The server refuses it right now.'])
  })

  it('keeps suspended and revoked keys as such, adding any other reason', () => {
    const suspended = apiKeyState({ status: 'suspended', is_currently_effective: false, ineffective_reasons: ['key_suspended', 'no_effective_scopes'] }, NOW)
    expect(suspended).toMatchObject({ kind: 'suspended', label: 'Suspended', color: 'warning' })
    expect(suspended.reasons).toHaveLength(1)
    expect(suspended.reasons[0]).toMatch(/None of its scopes/)
    expect(apiKeyState({ status: 'suspended', ineffective_reasons: ['key_suspended'] }, NOW).reasons).toEqual([])
    expect(apiKeyState({ status: 'revoked', expires_at: iso(NOW - DAY) }, NOW)).toMatchObject({ kind: 'revoked', label: 'Revoked', color: 'error', reasons: [] })
  })

  it('words unknown reason codes', () => {
    expect(ineffectiveReasonText('quota_exhausted')).toBe('Quota exhausted.')
  })
})

describe('expiry', () => {
  it('knows past and soon', () => {
    expect(isPastExpiry({ expires_at: null }, NOW)).toBe(false)
    expect(isPastExpiry({ expires_at: iso(NOW + DAY) }, NOW)).toBe(false)
    expect(expiresSoon({ status: 'active', expires_at: iso(NOW + 3 * DAY) }, NOW)).toBe(true)
    expect(expiresSoon({ status: 'active', expires_at: iso(NOW + 30 * DAY) }, NOW)).toBe(false)
    expect(expiresSoon({ status: 'active', expires_at: iso(NOW - DAY) }, NOW)).toBe(false)
    expect(expiresSoon({ status: 'revoked', expires_at: iso(NOW + DAY) }, NOW)).toBe(false)
  })

  it('treats date-expired keys as terminal in the default view (F-184)', () => {
    const keys = [
      { status: 'active' as const },
      { status: 'revoked' as const },
      { status: 'suspended' as const },
      { status: 'active' as const, expires_at: iso(NOW - DAY) }
    ]
    expect(isTerminalKey(keys[3]!, NOW)).toBe(true)
    expect(visibleKeys(keys, false, NOW)).toEqual([{ status: 'active' }, { status: 'suspended' }])
    expect(visibleKeys(keys, true, NOW)).toHaveLength(4)
  })

  it('replaces a key with the expiry closest to its lifetime', () => {
    expect(replacementExpiry({ created_at: iso(NOW - 31 * DAY), expires_at: iso(NOW - DAY) })).toBe('30')
    expect(replacementExpiry({ created_at: iso(NOW - 400 * DAY), expires_at: iso(NOW - 35 * DAY) })).toBe('365')
    expect(replacementExpiry({ created_at: iso(NOW), expires_at: null })).toBe('90')
    expect(expiryDays('never')).toBeUndefined()
    expect(expiryDays('180')).toBe(180)
  })
})

describe('apiKeyActionStates (F-080, F-082, F-184)', () => {
  const all = { canUpdate: true, canDelete: true, canReplace: true }
  const actions = (states: ReturnType<typeof apiKeyActionStates>) => states.map(s => (s.disabledReason ? `${s.action} (disabled)` : s.action))

  it('offers nothing on a revoked key and only a replacement on an expired one', () => {
    expect(apiKeyActionStates({ status: 'revoked' }, all, NOW)).toEqual([])
    expect(actions(apiKeyActionStates({ status: 'active', expires_at: iso(NOW - DAY) }, all, NOW))).toEqual(['replace'])
    expect(apiKeyActionStates({ status: 'expired' }, { canUpdate: true, canDelete: true }, NOW)).toEqual([])
  })

  it('rotates only an active key in effect; a suspended or refused key says why not', () => {
    expect(actions(apiKeyActionStates({ status: 'active', is_currently_effective: true }, all, NOW))).toEqual(['edit', 'rotate', 'suspend', 'revoke'])
    const suspended = apiKeyActionStates({ status: 'suspended' }, all, NOW)
    expect(actions(suspended)).toEqual(['edit', 'rotate (disabled)', 'reactivate', 'revoke'])
    expect(suspended[1]!.disabledReason).toBe(ROTATE_SUSPENDED_REASON)
    const refused = apiKeyActionStates({ status: 'active', is_currently_effective: false, ineffective_reasons: ['owner_inactive'] }, all, NOW)
    expect(refused[1]).toEqual({ action: 'rotate', disabledReason: ROTATE_INEFFECTIVE_REASON })
  })

  it('follows the grants', () => {
    expect(actions(apiKeyActionStates({ status: 'active' }, { canUpdate: false, canDelete: true }, NOW))).toEqual(['revoke'])
    expect(apiKeyActionStates({ status: 'active' }, { canUpdate: false, canDelete: false }, NOW)).toEqual([])
  })

  it('builds menu items with the reason on a disabled item, and none when nothing applies', () => {
    const calls: string[] = []
    const items = apiKeyMenuItems(apiKeyActionStates({ status: 'suspended' }, all, NOW), {
      view: () => calls.push('view'),
      edit: () => calls.push('edit'),
      rotate: () => calls.push('rotate'),
      reactivate: () => calls.push('reactivate'),
      revoke: () => calls.push('revoke')
    })
    expect(items.map(i => i.label)).toEqual(['View details', 'Edit', 'Rotate', 'Reactivate', 'Revoke'])
    expect(items[2]).toMatchObject({ disabled: true, description: ROTATE_SUSPENDED_REASON })
    expect(items[2]!.onSelect).toBeUndefined()
    expect(items[4]).toMatchObject({ color: 'error' })
    expect(apiKeyMenuItems(apiKeyActionStates({ status: 'revoked' }, all, NOW), { view: () => {} })).toEqual([])
  })
})

describe('keyListEmptyCopy (F-184)', () => {
  it('reads "No keys yet" only when nothing is hidden', () => {
    expect(keyListEmptyCopy({ hiddenTerminal: 0, noneYet: 'Create one.' })).toEqual({ title: 'No keys yet', description: 'Create one.' })
  })

  it('says how many revoked or expired keys are hidden', () => {
    expect(keyListEmptyCopy({ hiddenTerminal: 1, noneYet: 'x' })).toEqual({ title: 'No active keys', description: '1 revoked or expired key is hidden. Include revoked and expired to see it.' })
    expect(keyListEmptyCopy({ hiddenTerminal: 21, noneYet: 'x' }).description).toBe('21 revoked or expired keys are hidden. Include revoked and expired to see them.')
  })
})

describe('entity key inventory status filter (v-keys-audit-01)', () => {
  it('offers no Expired choice: the server filters on the stored status and never stores expired', () => {
    expect(KEY_INVENTORY_STATUSES).toEqual(['active', 'suspended', 'revoked', 'all'])
    expect(KEY_INVENTORY_STATUS_ITEMS.map(item => item.value)).toEqual([...KEY_INVENTORY_STATUSES])
    expect(KEY_INVENTORY_STATUS_ITEMS.map(item => item.label)).not.toContain('Expired')
  })

  it('says the default view includes keys past their expiry date', () => {
    expect(KEY_INVENTORY_STATUS_ITEMS[0]).toEqual({ label: 'Active (includes expired)', value: 'active' })
  })

  it('offers Show all statuses from the default empty view, without a Clear filters that would change nothing', () => {
    expect(keyInventoryEmptyCopy({ filtered: false, status: 'active' })).toEqual({
      title: 'No active keys here',
      description: 'No active key is anchored at this entity. Show all statuses to see its suspended and revoked keys.',
      clearFilters: false,
      showAllStatuses: true
    })
  })

  it('offers Show all statuses next to Clear filters when a filter matches nothing, unless every status is shown', () => {
    expect(keyInventoryEmptyCopy({ filtered: true, status: 'suspended' })).toMatchObject({ title: 'No keys match', clearFilters: true, showAllStatuses: true })
    expect(keyInventoryEmptyCopy({ filtered: true, status: 'active' })).toMatchObject({ clearFilters: true, showAllStatuses: true })
    expect(keyInventoryEmptyCopy({ filtered: true, status: 'all' })).toEqual({
      title: 'No keys match',
      description: 'Try a different search or clear the filters.',
      clearFilters: true,
      showAllStatuses: false
    })
  })
})

describe('display', () => {
  it('labels type and rate limit', () => {
    expect(apiKeyTypeLabel('sk_test_abcd')).toBe('Test')
    expect(apiKeyTypeLabel('sk_live_abcd')).toBe('Live')
    expect(rateLimitLabel(0)).toBe('No limit')
    expect(rateLimitLabel(60)).toBe('60 requests per minute')
  })
})

describe('personalKeySchema (F-083, F-114)', () => {
  const key = {
    name: 'ci',
    description: '',
    prefix_type: 'sk_live' as const,
    scopes: ['user:read'],
    no_rate_limit: false,
    rate_limit_per_minute: 60 as number | null,
    expires: '90' as const,
    ip_whitelist: [],
    entity_id: '',
    inherit_from_tree: false
  }

  it('accepts an unrestricted key and a key restricted to an entity and its children', () => {
    expect(personalKeySchema.safeParse(key).success).toBe(true)
    expect(personalKeySchema.safeParse({ ...key, entity_id: 'e1', inherit_from_tree: true }).success).toBe(true)
  })

  it('needs an entity before including its children', () => {
    const result = personalKeySchema.safeParse({ ...key, inherit_from_tree: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['inherit_from_tree'])
  })

  it('never turns a blank rate limit into no limit', () => {
    expect(personalKeySchema.safeParse({ ...key, rate_limit_per_minute: null }).success).toBe(false)
    expect(rateLimitWire({ no_rate_limit: true, rate_limit_per_minute: null })).toBe(0)
    expect(rateLimitWire({ no_rate_limit: false, rate_limit_per_minute: 30 })).toBe(30)
  })
})
