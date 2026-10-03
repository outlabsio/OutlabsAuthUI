import { describe, expect, it } from 'vitest'
import { isSensitiveAuditKey, redactAuditPayload, REDACTED } from '~/utils/audit-redaction'
import {
  AUDIT_ACCOUNT_CATEGORIES,
  AUDIT_CATEGORIES,
  AUDIT_EVENT_TYPES,
  auditCategoriesFor,
  auditCategoryLabel,
  auditChanges,
  auditEntityName,
  auditEntityPath,
  auditEventLabel,
  auditEventsToCsv,
  auditEventsToJson,
  auditEventTone,
  auditEventTypeItems,
  auditRangeLabel,
  auditRequestParams,
  auditRoleName,
  auditSubject,
  formatAuditValue,
  invalidAuditIdFilters
} from '~/utils/audit'
import { emptyAuditFilters, type UserAuditEvent } from '~/types/audit'

const opts = { locale: 'en-US', timeZone: 'UTC' }

// Payload shapes as outlabs-auth 0.1.0a34 records them.
const apiKeyRevoked = {
  before: { name: 'ci', key_id: 'b4eb97ba-1de7-4a0c-9245-8fda59192bb2', prefix: 'sk_live_cf3e7c65', scopes: ['user:read'], status: 'active', rate_limit_per_minute: 60 },
  after: { name: 'ci', key_id: 'b4eb97ba-1de7-4a0c-9245-8fda59192bb2', prefix: 'sk_live_cf3e7c65', scopes: ['user:read'], status: 'revoked', rate_limit_per_minute: 60 },
  metadata: { api_key_id: 'b4eb97ba-1de7-4a0c-9245-8fda59192bb2', api_key_prefix: 'sk_live_cf3e7c65' }
}
const membershipCreated = {
  before: null,
  after: { status: 'active', role_names: ['Agent'], entity_path: ['Acme', 'West', 'SF Office'], entity_display_name: 'SF Office', valid_until: null },
  metadata: { entity_path: ['Acme', 'West', 'SF Office'], entity_display_name: 'SF Office', history_event_type: 'created' }
}

function event(overrides: Partial<UserAuditEvent> = {}): UserAuditEvent {
  return {
    id: 'e1',
    occurred_at: '2026-09-30T10:00:00Z',
    event_category: 'credential',
    event_type: 'user.api_key_revoked',
    event_source: 'api_keys_router.delete_api_key',
    actor_user_id: '11111111-1111-4111-8111-111111111111',
    subject_user_id: '22222222-2222-4222-8222-222222222222',
    subject_email_snapshot: 'agent@example.com',
    root_entity_id: null,
    entity_id: null,
    role_id: null,
    request_id: null,
    ip_address: null,
    user_agent: null,
    reason: null,
    before: null,
    after: null,
    metadata: null,
    ...overrides
  } as UserAuditEvent
}

describe('audit redaction (F-188)', () => {
  it.each([
    'api_key_id', 'api_key_prefix', 'key_id', 'prefix', 'revoked_refresh_tokens_count', 'last_password_change',
    'password_reset_expires', 'invite_token_expires', 'refresh_token_stored', 'token_type', 'is_superuser', 'apiKeyId',
    'auth_method', 'device_name', 'access_code_length', 'password_changed_at', 'service_api_key_id', 'x_api_key_prefix'
  ])('keeps %s readable', (key) => {
    expect(isSensitiveAuditKey(key)).toBe(false)
  })

  it.each([
    'password', 'password_hash', 'hashed_password', 'secret', 'client_secret', 'token', 'access_token', 'refresh_token',
    'key_hash', 'api_key', 'apiKey', 'API-Key', 'authorization', 'Authorization', 'cookie', 'oauth_refresh_token',
    'webhook_secret', 'otp', 'access_code', 'verification_code', 'private_key', 'service_api_key', 'x_api_key', 'serviceApiKey'
  ])('hides %s', (key) => {
    expect(isSensitiveAuditKey(key)).toBe(true)
  })

  it('keeps the identifying fields of an API key event and hides secrets at any depth', () => {
    expect(redactAuditPayload(apiKeyRevoked.metadata)).toEqual(apiKeyRevoked.metadata)
    expect(redactAuditPayload({ nested: { refresh_token: 'r', items: [{ client_secret: 's', id: 1 }] }, password: null })).toEqual({
      nested: { refresh_token: REDACTED, items: [{ client_secret: REDACTED, id: 1 }] },
      password: null
    })
    expect(redactAuditPayload(null)).toBeNull()
  })

  it('a password change shows when it happened instead of hiding the only change', () => {
    const changes = auditChanges({ before: { last_password_change: '2026-09-01T00:00:00Z' }, after: { last_password_change: '2026-09-30T10:00:00Z' } }, opts)
    expect(changes).toEqual([{ field: 'last_password_change', label: 'Last password change', before: 'Sep 1, 2026, 12:00 AM', after: 'Sep 30, 2026, 10:00 AM' }])
  })
})

describe('audit vocabulary', () => {
  it('names every known event type and humanizes unknown ones', () => {
    expect(auditEventLabel('user.login_failed')).toBe('Sign-in failed')
    expect(auditEventLabel('user.membership_entity_archived')).toBe('Membership ended (entity archived)')
    expect(auditEventLabel('user.thing_happened')).toBe('Thing happened')
    expect(auditEventLabel('')).toBe('')
  })

  it('every known type belongs to a known category', () => {
    const categories = new Set(AUDIT_CATEGORIES.map(c => c.value))
    for (const type of AUDIT_EVENT_TYPES) expect(categories.has(type.category)).toBe(true)
    expect(auditEventTypeItems('privilege').map(t => t.value)).toEqual(['user.superuser_granted', 'user.superuser_revoked'])
    expect(auditEventTypeItems().length).toBe(AUDIT_EVENT_TYPES.length)
  })

  it('labels categories, unknown ones humanized', () => {
    expect(auditCategoryLabel('authentication')).toBe('Sign-ins and sessions')
    expect(auditCategoryLabel('machine_keys')).toBe('Machine keys')
    expect(auditCategoryLabel(null)).toBe('Uncategorized')
  })

  it('flags the events an incident review looks for first', () => {
    expect(auditEventTone(event({ event_type: 'user.login' }))).toBe('neutral')
    expect(auditEventTone(event({ event_type: 'user.login_failed' }))).toBe('warning')
    expect(auditEventTone(event({ event_type: 'user.superuser_granted' }))).toBe('warning')
    expect(auditEventTone(event({ event_type: 'user.deleted' }))).toBe('error')
    expect(auditEventTone(event({ event_type: 'user.status_changed', after: { status: 'suspended' } }))).toBe('warning')
    expect(auditEventTone(event({ event_type: 'user.status_changed', after: { status: 'active' } }))).toBe('neutral')
  })

  it('reads entity and role names from the payload', () => {
    expect(auditEntityName(membershipCreated)).toBe('SF Office')
    expect(auditEntityPath(membershipCreated)).toBe('Acme › West › SF Office')
    expect(auditRoleName({ before: null, after: { role_name: 'agent', role_display_name: 'Agent' }, metadata: null })).toBe('Agent')
    expect(auditEntityName(apiKeyRevoked)).toBeNull()
  })
})

// Entity lifecycle and entity-type settings events, as outlabs-auth 0.1.0a35 records them
// (services/entity.py _record_entity_audit_event, routers/config.py): no subject account.
const entityUpdated = event({
  event_category: 'entity',
  event_type: 'entity.updated',
  event_source: 'entity_service.updated',
  subject_user_id: null,
  subject_email_snapshot: '',
  entity_id: '33333333-3333-4333-8333-333333333333',
  before: { display_name: 'West Office' },
  after: { display_name: 'West Coast Office' },
  metadata: { entity_name: 'west_office', entity_display_name: 'West Coast Office', entity_type: 'office', changed_fields: ['display_name'] }
})
const entityTypesChanged = event({
  event_category: 'config',
  event_type: 'config.entity_types_updated',
  event_source: 'config_router.update_entity_type_config',
  subject_user_id: null,
  subject_email_snapshot: '',
  before: { allowed_root_types: { structural: ['organization'], access_group: [] } },
  after: { allowed_root_types: { structural: ['organization', 'campus'], access_group: [] } }
})

describe('entity and settings events (F-241)', () => {
  it('names the entity lifecycle and entity-type settings events and their categories', () => {
    expect(auditEventLabel('entity.created')).toBe('Entity created')
    expect(auditEventLabel('entity.updated')).toBe('Entity updated')
    expect(auditEventLabel('entity.moved')).toBe('Entity moved')
    expect(auditEventLabel('entity.archived')).toBe('Entity archived')
    expect(auditEventLabel('config.entity_types_updated')).toBe('Entity types changed')
    expect(auditCategoryLabel('entity')).toBe('Entities')
    expect(auditCategoryLabel('config')).toBe('Settings')
    expect(auditEventTypeItems('entity').map(t => t.value)).toEqual(['entity.created', 'entity.updated', 'entity.moved', 'entity.archived'])
    expect(auditEventTypeItems('config').map(t => t.value)).toEqual(['config.entity_types_updated'])
  })

  it('offers each category where it can be found: entity ones with a hierarchy, settings to global admins only', () => {
    const values = (reach: { hierarchy: boolean, global: boolean }) => auditCategoriesFor(reach).map(c => c.value)
    expect(values({ hierarchy: true, global: true })).toEqual(AUDIT_CATEGORIES.map(c => c.value))
    expect(values({ hierarchy: true, global: false })).toContain('entity')
    expect(values({ hierarchy: true, global: false })).not.toContain('config')
    expect(values({ hierarchy: false, global: true })).not.toContain('entity')
    expect(values({ hierarchy: false, global: true })).not.toContain('config')
    expect(auditEventTypeItems(null, { hierarchy: false, global: true }).some(t => t.category === 'entity' || t.category === 'config')).toBe(false)
    expect(auditEventTypeItems(null, { hierarchy: true, global: false }).map(t => t.value)).toContain('entity.moved')
    expect(auditEventTypeItems(null, { hierarchy: true, global: false }).map(t => t.value)).not.toContain('config.entity_types_updated')
    // A user's History lists events about the account: never entity or settings ones.
    expect(AUDIT_ACCOUNT_CATEGORIES.map(c => c.value)).toEqual(AUDIT_CATEGORIES.map(c => c.value).filter(v => v !== 'entity' && v !== 'config'))
  })

  it('says what an event is about when it has no account: the entity, or the settings', () => {
    expect(auditSubject(event())).toEqual({ kind: 'account', label: 'agent@example.com' })
    expect(auditSubject(event({ subject_email_snapshot: '' }))).toEqual({ kind: 'account', label: 'Unknown account' })
    expect(auditSubject(entityUpdated)).toEqual({ kind: 'entity', label: 'West Coast Office' })
    expect(auditSubject({ ...entityUpdated, metadata: { entity_name: 'west_office' } })).toEqual({ kind: 'entity', label: 'west_office' })
    expect(auditSubject({ ...entityUpdated, metadata: null })).toEqual({ kind: 'entity', label: 'An entity' })
    expect(auditSubject(entityTypesChanged)).toEqual({ kind: 'settings', label: 'Settings' })
    expect(auditSubject(event({ event_category: 'machine_keys', event_type: 'machine_key.created', subject_user_id: null, subject_email_snapshot: '' }))).toBeNull()
  })

  it('shows what an entity update and an entity-type change changed', () => {
    expect(auditChanges(entityUpdated, opts)).toEqual([{ field: 'display_name', label: 'Display name', before: 'West Office', after: 'West Coast Office' }])
    // One list per entity class: only the class that changed, as lists.
    expect(auditChanges(entityTypesChanged, opts)).toEqual([{
      field: 'allowed_root_types.structural',
      label: 'Allowed root types › Structural',
      before: 'organization',
      after: 'organization, campus'
    }])
    expect(auditChanges({
      before: { default_child_types: { structural: ['office'], access_group: [] } },
      after: { default_child_types: { structural: ['office'], access_group: ['team'] } }
    }, opts)).toEqual([{ field: 'default_child_types.access_group', label: 'Default child types › Access group', before: 'None', after: 'team' }])
    // A group recorded on one side only stays one field.
    expect(auditChanges({ before: null, after: { scope: { kind: 'org' } } }, opts)).toEqual([{ field: 'scope', label: 'Scope', before: '—', after: '{"kind":"org"}' }])
  })

  it('exports an event without an account with an empty subject', () => {
    const [, row] = auditEventsToCsv([entityUpdated]).trim().split('\r\n')
    expect(row).toContain('entity,entity.updated,Entity updated,,,11111111-1111-4111-8111-111111111111,33333333-3333-4333-8333-333333333333')
  })
})

describe('auditChanges', () => {
  it('lists only the fields that changed', () => {
    expect(auditChanges(apiKeyRevoked, opts)).toEqual([{ field: 'status', label: 'Status', before: 'active', after: 'revoked' }])
  })

  it('lists every recorded field of a creation, with no before value', () => {
    const changes = auditChanges(membershipCreated, opts)
    expect(changes.map(c => c.field)).toEqual(['status', 'role_names', 'entity_path', 'entity_display_name'])
    expect(changes[1]).toEqual({ field: 'role_names', label: 'Role names', before: '—', after: 'Agent' })
  })

  it('redacts a secret on either side', () => {
    expect(auditChanges({ before: { client_secret: 'a' }, after: { client_secret: 'b' } }, opts)).toEqual([])
    expect(auditChanges({ before: null, after: { client_secret: 'b' } }, opts)).toEqual([{ field: 'client_secret', label: 'Client secret', before: '—', after: '[REDACTED]' }])
  })

  it('formats values', () => {
    expect(formatAuditValue(null)).toBe('—')
    expect(formatAuditValue(true)).toBe('Yes')
    expect(formatAuditValue([])).toBe('None')
    expect(formatAuditValue(['a', 'b'])).toBe('a, b')
    expect(formatAuditValue({ a: 1 })).toBe('{"a":1}')
  })
})

describe('audit filters -> request', () => {
  it('sends the set filters and drops malformed ids', () => {
    const params = auditRequestParams({ ...emptyAuditFilters, category: 'credential', eventType: 'user.login', actorUserId: 'not-a-uuid', subjectUserId: '22222222-2222-4222-8222-222222222222' }, { page: 2, limit: 25 })
    expect(Object.fromEntries(params)).toEqual({ page: '2', limit: '25', category: 'credential', event_type: 'user.login', subject_user_id: '22222222-2222-4222-8222-222222222222' })
    expect(invalidAuditIdFilters({ subjectUserId: '', actorUserId: 'not-a-uuid', entityId: 'x' })).toEqual(['actorUserId', 'entityId'])
  })

  it('bounds whole days in the given time zone, and a preset relative to now', () => {
    const days = auditRequestParams({ ...emptyAuditFilters, occurredFrom: '2026-09-01', occurredTo: '2026-09-30' }, { page: 1, limit: 25, timeZone: 'UTC' })
    expect(days.get('occurred_from')).toBe('2026-09-01T00:00:00.000Z')
    expect(days.get('occurred_to')).toBe('2026-09-30T23:59:59.999Z')
    const now = Date.parse('2026-10-01T12:00:00Z')
    const preset = auditRequestParams({ ...emptyAuditFilters, range: '7d', occurredFrom: '2020-01-01' }, { page: 1, limit: 25, now })
    expect(preset.get('occurred_from')).toBe('2026-09-24T12:00:00.000Z')
    expect(preset.has('occurred_to')).toBe(false)
    // An export pins the open upper bound.
    expect(auditRequestParams({ ...emptyAuditFilters, range: '24h' }, { page: 1, limit: 100, now, until: now }).get('occurred_to')).toBe('2026-10-01T12:00:00.000Z')
    // Older links carry an exact date-time.
    expect(auditRequestParams({ ...emptyAuditFilters, occurredFrom: '2026-09-01T10:30:00Z' }, { page: 1, limit: 25 }).get('occurred_from')).toBe('2026-09-01T10:30:00.000Z')
  })

  it('labels the range', () => {
    expect(auditRangeLabel({ range: '30d', occurredFrom: '', occurredTo: '' })).toBe('Last 30 days')
    expect(auditRangeLabel({ range: '', occurredFrom: '2026-09-01', occurredTo: '2026-09-30' }, opts)).toBe('Sep 1, 2026 – Sep 30, 2026')
    expect(auditRangeLabel({ range: '', occurredFrom: '2026-09-01', occurredTo: '' }, opts)).toBe('From Sep 1, 2026')
    expect(auditRangeLabel({ range: '', occurredFrom: '', occurredTo: '' })).toBeNull()
  })
})

describe('audit export (F-190)', () => {
  it('writes redacted CSV with escaped cells and no live formulas', () => {
    const csv = auditEventsToCsv([event({ reason: '=HYPERLINK("x")', before: { password: 'p' }, after: { note: 'a, "b"' } })])
    const [header, row] = csv.trim().split('\r\n')
    expect(header!.split(',').slice(0, 4)).toEqual(['occurred_at', 'event_category', 'event_type', 'event'])
    expect(row).toContain('API key revoked')
    expect(row).toContain('"\'=HYPERLINK(""x"")"')
    expect(row).toContain('[REDACTED]')
    expect(row).not.toContain('"p"')
  })

  it('writes redacted JSON with the filters and completeness', () => {
    const json = JSON.parse(auditEventsToJson([event({ metadata: { api_key_id: 'k', refresh_token: 'r' } })], { exportedAt: '2026-10-01T00:00:00Z', filters: { category: 'credential' }, total: 3, complete: false }))
    expect(json.complete).toBe(false)
    expect(json.total).toBe(3)
    expect(json.events[0].metadata).toEqual({ api_key_id: 'k', refresh_token: REDACTED })
  })
})
