import type { MaybeRefOrGetter } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { DetailItem } from '~/types/display'
import type { UserAuditEvent } from '~/types/audit'
import { appSection } from '~/utils/capabilities'
import { redactAuditPayload } from '~/utils/audit-redaction'
import {
  auditCategoryLabel,
  auditChanges,
  auditEntityName,
  auditEntityPath,
  auditEventBadge,
  auditEventLabel,
  auditEventTone,
  auditRoleName,
  auditToneLabel
} from '~/utils/audit'

// One audit event as every audit view shows it (F-091/F-189): the humanized label and severity
// badge, names snapshotted in the payload, the before/after changes, the context fields and the
// redacted raw payloads, plus the pivots into the Audit workspace (links, so they work on the
// user and entity pages too, offered only to accounts that may open Audit).

export type AuditPivot = { key: string, label: string, to: RouteLocationRaw }

export function useAuditEventView(source: MaybeRefOrGetter<UserAuditEvent>) {
  const { canAccess, isEnterprise } = useAuth()
  const event = computed(() => toValue(source))

  const label = computed(() => auditEventLabel(event.value.event_type))
  const badge = computed(() => auditEventBadge(event.value))
  const toneLabel = computed(() => auditToneLabel(auditEventTone(event.value)))
  const categoryLabel = computed(() => auditCategoryLabel(event.value.event_category))
  const entityName = computed(() => auditEntityName(event.value))
  const entityPath = computed(() => auditEntityPath(event.value))
  const roleName = computed(() => auditRoleName(event.value))
  const subjectLabel = computed(() => event.value.subject_email_snapshot || (event.value.subject_user_id ? 'Unknown account' : null))
  const subjectTo = computed(() => (event.value.subject_user_id && canAccess('users') ? `/app/users/${event.value.subject_user_id}` : undefined))

  const changes = computed(() => auditChanges(event.value))

  const contextItems = computed<DetailItem[]>(() => {
    const e = event.value
    return [
      { key: 'type', label: 'Event type', value: e.event_type, type: 'code' },
      { key: 'category', label: 'Category', value: categoryLabel.value },
      { key: 'occurred', label: 'Occurred', value: e.occurred_at, type: 'datetime' },
      // AppAuditEventDetails names the actor through AppUserLabel (#value-actor), never the raw id.
      { key: 'actor', label: 'Actor', value: e.actor_user_id, fallback: 'Not recorded' },
      ...(e.role_id ? [{ key: 'role', label: 'Role', value: roleName.value ?? e.role_id, type: roleName.value ? 'text' : 'code' } as DetailItem] : []),
      ...(isEnterprise.value && (e.entity_id || entityPath.value) ? [{ key: 'entity', label: 'Entity', value: entityPath.value ?? entityName.value ?? e.entity_id, type: entityPath.value || entityName.value ? 'text' : 'code' } as DetailItem] : []),
      ...(e.reason ? [{ key: 'reason', label: 'Reason', value: e.reason, full: true } as DetailItem] : []),
      ...(e.ip_address ? [{ key: 'ip', label: 'IP address', value: e.ip_address, type: 'code' } as DetailItem] : []),
      ...(e.user_agent ? [{ key: 'agent', label: 'User agent', value: e.user_agent, full: true } as DetailItem] : []),
      { key: 'source', label: 'Recorded by', value: e.event_source, type: 'code' },
      ...(e.request_id ? [{ key: 'request', label: 'Request ID', value: e.request_id, type: 'code' } as DetailItem] : []),
      { key: 'id', label: 'Event ID', value: e.id, type: 'code' }
    ]
  })

  const rawPayloads = computed(() => (['before', 'after', 'metadata'] as const)
    .map(key => ({ key, label: key === 'metadata' ? 'Metadata' : key === 'before' ? 'Before' : 'After', value: event.value[key] }))
    .filter(part => part.value && Object.keys(part.value).length > 0)
    .map(part => ({ key: part.key, label: part.label, json: JSON.stringify(redactAuditPayload(part.value), null, 2) })))

  const pivots = computed<AuditPivot[]>(() => {
    if (!canAccess('audit')) return []
    const e = event.value
    const path = appSection('audit').to
    return [
      ...(e.subject_user_id ? [{ key: 'subject', label: `Events about ${subjectLabel.value ?? 'this account'}`, to: { path, query: { subjectUserId: e.subject_user_id } } }] : []),
      ...(e.actor_user_id ? [{ key: 'actor', label: 'Actions by this actor', to: { path, query: { actorUserId: e.actor_user_id } } }] : []),
      ...(isEnterprise.value && e.entity_id ? [{ key: 'entity', label: `Events at ${entityName.value ?? 'this entity'}`, to: { path, query: { entityId: e.entity_id } } }] : []),
      { key: 'type', label: `All "${label.value}" events`, to: { path, query: { eventType: e.event_type } } }
    ]
  })

  return { label, badge, toneLabel, categoryLabel, entityName, entityPath, roleName, subjectLabel, subjectTo, changes, contextItems, rawPayloads, pivots }
}
