import type { BadgeProps } from '@nuxt/ui'
import { formatDateTime } from '~/utils/format-date'
import { redactAuditPayload } from '~/utils/audit-redaction'
import { isUuid } from '~/utils/users'
import { endOfDayIso, startOfDayIso } from '~/utils/validity'
import type { AuditFilters, UserAuditEvent } from '~/types/audit'

// The audit vocabulary and display rules (F-090/F-091/F-190/F-191). Pure: unit-tested, shared by
// the Audit workspace, the event cards on user and entity pages, the dashboard's recent
// activity and the export.

// ── Vocabulary ──

// The categories outlabs-auth records (UserAuditEvent.event_category). The API filters by exact
// value, so the console offers these instead of a free-text box. `entity` (entity lifecycle) and
// `config` (entity-type settings) are recorded since outlabs-auth 0.1.0a35 (F-241).
export const AUDIT_CATEGORIES: readonly { value: string, label: string }[] = [
  { value: 'authentication', label: 'Sign-ins and sessions' },
  { value: 'config', label: 'Settings' },
  { value: 'credential', label: 'Passwords and credentials' },
  { value: 'entity', label: 'Entities' },
  { value: 'invitation', label: 'Invitations' },
  { value: 'membership', label: 'Memberships' },
  { value: 'privilege', label: 'Superuser' },
  { value: 'profile', label: 'Profile' },
  { value: 'role', label: 'Roles' },
  { value: 'status', label: 'Status' }
]

// The categories of events about an account (a user's History). Entity and settings events are
// about no account.
export const AUDIT_ACCOUNT_CATEGORIES: readonly { value: string, label: string }[] = AUDIT_CATEGORIES
  .filter(category => category.value !== 'entity' && category.value !== 'config')

// Who can find which categories. Entity and settings events are recorded only where entities
// exist (EnterpriseRBAC), and settings events belong to no organization, so only admins who see
// every organization find them (a delegated admin's search is limited to their organization).
export type AuditReach = { hierarchy: boolean, global: boolean }

export function auditCategoryInReach(category: string, reach: AuditReach): boolean {
  if (category === 'entity') return reach.hierarchy
  if (category === 'config') return reach.hierarchy && reach.global
  return true
}

// The Category filter's options for this admin.
export function auditCategoriesFor(reach: AuditReach): { value: string, label: string }[] {
  return AUDIT_CATEGORIES.filter(category => auditCategoryInReach(category.value, reach))
}

export type AuditEventTypeInfo = { value: string, label: string, category: string }

// Every event type outlabs-auth writes to the audit table (outlabs-auth 0.1.0a35). A type the
// server adds later still renders (humanized) and can be typed into the Event type filter.
export const AUDIT_EVENT_TYPES: readonly AuditEventTypeInfo[] = [
  { value: 'user.login', label: 'Signed in', category: 'authentication' },
  { value: 'user.login_failed', label: 'Sign-in failed', category: 'authentication' },
  { value: 'user.magic_link_requested', label: 'Magic link requested', category: 'authentication' },
  { value: 'user.magic_link_verified', label: 'Signed in with a magic link', category: 'authentication' },
  { value: 'user.access_code_requested', label: 'Access code requested', category: 'authentication' },
  { value: 'user.access_code_verified', label: 'Signed in with an access code', category: 'authentication' },
  { value: 'user.sessions_revoked', label: 'Sessions revoked', category: 'authentication' },
  { value: 'user.password_changed', label: 'Password changed', category: 'credential' },
  { value: 'user.password_reset_requested', label: 'Password reset requested', category: 'credential' },
  { value: 'user.password_reset_completed', label: 'Password reset', category: 'credential' },
  { value: 'user.api_key_created', label: 'API key created', category: 'credential' },
  { value: 'user.api_key_updated', label: 'API key updated', category: 'credential' },
  { value: 'user.api_key_rotated', label: 'API key rotated', category: 'credential' },
  { value: 'user.api_key_revoked', label: 'API key revoked', category: 'credential' },
  { value: 'user.invited', label: 'Invited', category: 'invitation' },
  { value: 'user.invite_resent', label: 'Invitation resent', category: 'invitation' },
  { value: 'user.invite_accepted', label: 'Invitation accepted', category: 'invitation' },
  { value: 'user.membership_created', label: 'Membership added', category: 'membership' },
  { value: 'user.membership_updated', label: 'Membership updated', category: 'membership' },
  { value: 'user.membership_suspended', label: 'Membership suspended', category: 'membership' },
  { value: 'user.membership_reactivated', label: 'Membership reactivated', category: 'membership' },
  { value: 'user.membership_revoked', label: 'Membership removed', category: 'membership' },
  { value: 'user.membership_entity_archived', label: 'Membership ended (entity archived)', category: 'membership' },
  { value: 'user.superuser_granted', label: 'Superuser granted', category: 'privilege' },
  { value: 'user.superuser_revoked', label: 'Superuser revoked', category: 'privilege' },
  { value: 'user.profile_updated', label: 'Profile updated', category: 'profile' },
  { value: 'user.email_changed', label: 'Email changed', category: 'profile' },
  { value: 'user.phone_verify_requested', label: 'Phone verification requested', category: 'profile' },
  { value: 'user.phone_verified', label: 'Phone verified', category: 'profile' },
  { value: 'user.role_assigned', label: 'Role assigned', category: 'role' },
  { value: 'user.role_updated', label: 'Role assignment updated', category: 'role' },
  { value: 'user.role_revoked', label: 'Role revoked', category: 'role' },
  { value: 'user.status_changed', label: 'Status changed', category: 'status' },
  { value: 'user.deleted', label: 'Account deleted', category: 'status' },
  { value: 'user.restored', label: 'Account restored', category: 'status' },
  { value: 'entity.created', label: 'Entity created', category: 'entity' },
  { value: 'entity.updated', label: 'Entity updated', category: 'entity' },
  { value: 'entity.moved', label: 'Entity moved', category: 'entity' },
  { value: 'entity.archived', label: 'Entity archived', category: 'entity' },
  { value: 'config.entity_types_updated', label: 'Entity types changed', category: 'config' }
]

const EVENT_TYPES = new Map(AUDIT_EVENT_TYPES.map(type => [type.value, type]))
const CATEGORIES = new Map(AUDIT_CATEGORIES.map(category => [category.value, category.label]))

function sentenceCase(text: string): string {
  const trimmed = text.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed
}

// 'user.login_failed' -> 'Sign-in failed'; an unknown 'user.thing_done' -> 'Thing done'.
export function auditEventLabel(eventType: string): string {
  const known = EVENT_TYPES.get(eventType)
  if (known) return known.label
  const last = eventType.split('.').at(-1) ?? eventType
  return sentenceCase(last.replace(/[_-]+/g, ' ')) || eventType
}

export function auditCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Uncategorized'
  return CATEGORIES.get(category) ?? sentenceCase(category.replace(/[_-]+/g, ' '))
}

// The Event type filter's options: the known types, narrowed to the chosen category (and, given
// the admin's reach, to the categories they can find).
export function auditEventTypeItems(category?: string | null, reach?: AuditReach): AuditEventTypeInfo[] {
  return AUDIT_EVENT_TYPES.filter(type => (!category || type.category === category) && (!reach || auditCategoryInReach(type.category, reach)))
}

// ── Severity cues ──

export type AuditTone = 'neutral' | 'warning' | 'error'

// Most events are routine and stay neutral; the ones an incident review looks for first stand
// out: a failed sign-in, a privilege grant, an account deleted or suspended.
export function auditEventTone(event: Pick<UserAuditEvent, 'event_type' | 'after'>): AuditTone {
  switch (event.event_type) {
    case 'user.deleted':
      return 'error'
    case 'user.login_failed':
    case 'user.superuser_granted':
      return 'warning'
    case 'user.status_changed': {
      const status = payloadString(event.after, 'status')
      return status === 'suspended' || status === 'banned' ? 'warning' : 'neutral'
    }
    default:
      return 'neutral'
  }
}

// The word beside a flagged event, so the cue never rests on colour alone.
export function auditToneLabel(tone: AuditTone): string | null {
  if (tone === 'error') return 'Destructive'
  if (tone === 'warning') return 'Security'
  return null
}

export function auditEventBadge(event: Pick<UserAuditEvent, 'event_type' | 'after'>): BadgeProps {
  const tone = auditEventTone(event)
  return {
    label: auditEventLabel(event.event_type),
    color: tone,
    variant: tone === 'neutral' ? 'outline' : 'subtle'
  }
}

// ── Names carried in the payload ──

function payloadString(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function firstString(event: Pick<UserAuditEvent, 'before' | 'after' | 'metadata'>, keys: readonly string[]): string | null {
  for (const payload of [event.metadata, event.after, event.before]) {
    for (const key of keys) {
      const value = payloadString(payload, key)
      if (value) return value
    }
  }
  return null
}

// outlabs-auth snapshots the names of what an event touched (membership and role events), so an
// entity or role is named without another request. Null when the event carries no name.
export function auditEntityName(event: Pick<UserAuditEvent, 'before' | 'after' | 'metadata'>): string | null {
  return firstString(event, ['entity_display_name', 'entity_name'])
}

export function auditEntityPath(event: Pick<UserAuditEvent, 'before' | 'after' | 'metadata'>): string | null {
  for (const payload of [event.metadata, event.after, event.before]) {
    const path = payload?.entity_path
    if (Array.isArray(path) && path.every(part => typeof part === 'string') && path.length) return path.join(' › ')
  }
  return null
}

export function auditRoleName(event: Pick<UserAuditEvent, 'before' | 'after' | 'metadata'>): string | null {
  return firstString(event, ['role_display_name', 'role_name'])
}

// What an event is about. Account events name their account (the e-mail snapshot); entity
// events (outlabs-auth 0.1.0a35) have no account and are about the entity, named from their
// metadata; settings events are about the settings. Null when nothing is recorded.
export type AuditSubject = { kind: 'account' | 'entity' | 'settings', label: string }

export function auditSubject(event: Pick<UserAuditEvent, 'event_category' | 'event_type' | 'subject_user_id' | 'subject_email_snapshot' | 'before' | 'after' | 'metadata'>): AuditSubject | null {
  const email = event.subject_email_snapshot?.trim()
  if (email) return { kind: 'account', label: email }
  if (event.subject_user_id) return { kind: 'account', label: 'Unknown account' }
  if (event.event_category === 'entity' || event.event_type.startsWith('entity.')) {
    return { kind: 'entity', label: auditEntityName(event) ?? 'An entity' }
  }
  if (event.event_category === 'config' || event.event_type.startsWith('config.')) return { kind: 'settings', label: 'Settings' }
  return null
}

// ── Changes (before -> after) ──

export type AuditChange = {
  field: string
  label: string
  before: string
  after: string
}

export const AUDIT_EMPTY_VALUE = '—'

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
}

// One payload value as text: dates in the admin's locale and time zone, lists joined, nested
// objects as compact JSON. Expects redacted input.
export function formatAuditValue(value: unknown, options: { timeZone?: string, locale?: string } = {}): string {
  if (value === null || value === undefined || value === '') return AUDIT_EMPTY_VALUE
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return isIsoDateTime(value) ? formatDateTime(value, { ...options, fallback: value }) : value
  if (Array.isArray(value)) {
    if (!value.length) return 'None'
    return value.map(item => (item !== null && typeof item === 'object' ? JSON.stringify(item) : formatAuditValue(item, options))).join(', ')
  }
  return JSON.stringify(value)
}

export function auditFieldLabel(field: string): string {
  return sentenceCase(field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase())
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// The fields an event changed, each with its value before and after (redacted). An event with
// no `before` (something was created) lists every recorded field as new; fields equal on both
// sides are left out. A group recorded on both sides (the entity types' `allowed_root_types`,
// one list per entity class) lists the changed members of the group, labelled "Group › Member".
export function auditChanges(
  event: Pick<UserAuditEvent, 'before' | 'after'>,
  options: { timeZone?: string, locale?: string } = {}
): AuditChange[] {
  const before = redactAuditPayload(event.before ?? null)
  const after = redactAuditPayload(event.after ?? null)
  if (!before && !after) return []
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  const changes: AuditChange[] = []
  for (const key of keys) {
    const was = before?.[key]
    const now = after?.[key]
    if (JSON.stringify(was ?? null) === JSON.stringify(now ?? null)) continue
    if (isPlainObject(was) && isPlainObject(now)) {
      for (const member of new Set([...Object.keys(was), ...Object.keys(now)])) {
        if (JSON.stringify(was[member] ?? null) === JSON.stringify(now[member] ?? null)) continue
        changes.push({
          field: `${key}.${member}`,
          label: `${auditFieldLabel(key)} › ${auditFieldLabel(member)}`,
          before: formatAuditValue(was[member], options),
          after: formatAuditValue(now[member], options)
        })
      }
      continue
    }
    changes.push({
      field: key,
      label: auditFieldLabel(key),
      before: before ? formatAuditValue(was, options) : AUDIT_EMPTY_VALUE,
      after: after ? formatAuditValue(now, options) : AUDIT_EMPTY_VALUE
    })
  }
  return changes
}

// ── Filters (route query <-> request) ──

// Relative windows ("the last 7 days"); stored by id so a shared link stays relative.
export const AUDIT_RANGE_PRESETS = [
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: '90d', label: 'Last 90 days', ms: 90 * 24 * 60 * 60 * 1000 }
] as const
export type AuditRangePreset = typeof AUDIT_RANGE_PRESETS[number]['value']
export const AUDIT_RANGE_VALUES: readonly string[] = ['', ...AUDIT_RANGE_PRESETS.map(preset => preset.value)]

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const
export const AUDIT_DEFAULT_PAGE_SIZE = 25

const DAY = /^\d{4}-\d{2}-\d{2}$/

// A bound from the route query: a whole day (YYYY-MM-DD, the calendar's value: from = its start,
// to = its end, in the admin's time zone) or, for older links, an exact date-time.
function boundIso(value: string, edge: 'start' | 'end', timeZone?: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (DAY.test(trimmed)) return edge === 'start' ? startOfDayIso(trimmed, timeZone) : endOfDayIso(trimmed, timeZone)
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

// The filters a request can use. Ids that are not UUIDs (a hand-edited link) are dropped rather
// than sent, because the API refuses the whole search with a 422 for one malformed id.
export function invalidAuditIdFilters(filters: Pick<AuditFilters, 'subjectUserId' | 'actorUserId' | 'entityId'>): ('subjectUserId' | 'actorUserId' | 'entityId')[] {
  return (['subjectUserId', 'actorUserId', 'entityId'] as const).filter(key => filters[key].trim() && !isUuid(filters[key].trim()))
}

export function auditRequestParams(
  filters: AuditFilters,
  // `now` resolves a relative range; `until` pins the upper bound when the filters leave it open
  // (an export reads a fixed window, so events recorded meanwhile do not shift its pages).
  options: { page: number, limit: number, now?: number, until?: number, timeZone?: string }
): URLSearchParams {
  const params = new URLSearchParams({ page: String(options.page), limit: String(options.limit) })
  const category = filters.category.trim()
  if (category) params.set('category', category)
  const eventType = filters.eventType.trim()
  if (eventType) params.set('event_type', eventType)
  for (const [key, param] of [['subjectUserId', 'subject_user_id'], ['actorUserId', 'actor_user_id'], ['entityId', 'entity_id']] as const) {
    const id = filters[key].trim()
    if (id && isUuid(id)) params.set(param, id)
  }
  const preset = AUDIT_RANGE_PRESETS.find(p => p.value === filters.range)
  let to: string | null = null
  if (preset) {
    params.set('occurred_from', new Date((options.now ?? Date.now()) - preset.ms).toISOString())
  } else {
    const from = boundIso(filters.occurredFrom, 'start', options.timeZone)
    if (from) params.set('occurred_from', from)
    to = boundIso(filters.occurredTo, 'end', options.timeZone)
  }
  if (!to && options.until !== undefined) to = new Date(options.until).toISOString()
  if (to) params.set('occurred_to', to)
  return params
}

// "Sep 1 – Sep 30, 2026", "Last 7 days", "From Sep 1, 2026", or null when unbounded.
export function auditRangeLabel(filters: Pick<AuditFilters, 'range' | 'occurredFrom' | 'occurredTo'>, options: { locale?: string, timeZone?: string } = {}): string | null {
  const preset = AUDIT_RANGE_PRESETS.find(p => p.value === filters.range)
  if (preset) return preset.label
  const day = (value: string) => {
    if (!value.trim()) return null
    const iso = DAY.test(value.trim()) ? `${value.trim()}T12:00:00Z` : value.trim()
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return value.trim()
    return new Intl.DateTimeFormat(options.locale, { dateStyle: 'medium', ...(DAY.test(value.trim()) ? { timeZone: 'UTC' } : { timeStyle: 'short', timeZone: options.timeZone }) }).format(parsed)
  }
  const from = day(filters.occurredFrom)
  const to = day(filters.occurredTo)
  if (from && to) return from === to ? from : `${from} – ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return null
}

// ── Export (F-190) ──

// The most an export collects (pages of 100). Beyond it the file says it is partial.
export const AUDIT_EXPORT_MAX_EVENTS = 5000

const CSV_COLUMNS = [
  'occurred_at',
  'event_category',
  'event_type',
  'event',
  'subject_user_id',
  'subject_email',
  'actor_user_id',
  'entity_id',
  'root_entity_id',
  'role_id',
  'event_source',
  'request_id',
  'ip_address',
  'user_agent',
  'reason',
  'before',
  'after',
  'metadata'
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  // Neutralise spreadsheet formulas (a cell that starts with = + - @ is executed by Excel).
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// The events exactly as the console shows them: payloads redacted.
export function redactAuditEvent(event: UserAuditEvent): UserAuditEvent {
  return {
    ...event,
    before: redactAuditPayload(event.before ?? null),
    after: redactAuditPayload(event.after ?? null),
    metadata: redactAuditPayload(event.metadata ?? null)
  }
}

export function auditEventsToCsv(events: readonly UserAuditEvent[]): string {
  const rows = events.map(redactAuditEvent).map(event => [
    event.occurred_at,
    event.event_category,
    event.event_type,
    auditEventLabel(event.event_type),
    event.subject_user_id,
    event.subject_email_snapshot,
    event.actor_user_id,
    event.entity_id,
    event.root_entity_id,
    event.role_id,
    event.event_source,
    event.request_id,
    event.ip_address,
    event.user_agent,
    event.reason,
    event.before,
    event.after,
    event.metadata
  ].map(csvCell).join(','))
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
}

export type AuditExportMeta = {
  exportedAt: string
  filters: Record<string, string>
  total: number
  complete: boolean
}

export function auditEventsToJson(events: readonly UserAuditEvent[], meta: AuditExportMeta): string {
  return JSON.stringify({
    exported_at: meta.exportedAt,
    filters: meta.filters,
    total: meta.total,
    complete: meta.complete,
    events: events.map(redactAuditEvent)
  }, null, 2)
}

// "audit-events-2026-10-01.csv"
export function auditExportFileName(format: 'csv' | 'json', now: Date = new Date()): string {
  return `audit-events-${now.toISOString().slice(0, 10)}.${format}`
}
