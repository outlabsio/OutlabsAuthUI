import { useState } from 'react'

import { useNavigate } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'

import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type {
  AuditPageSearch,
  UserAuditEvent,
} from '@/features/audit/types/audit.types'
import {
  formatDateTime,
  formatToken,
  getAuditEventSummary,
  getAuditEventTone,
  getStringValue,
} from '@/features/users/utils/user-details-display'
import { routes } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

type AuditEventCardProps = {
  event: UserAuditEvent
  showSubject?: boolean
  showActor?: boolean
  showEntity?: boolean
}

function hasPayload(value?: Record<string, unknown> | null) {
  return Boolean(value && Object.keys(value).length > 0)
}

function formatJson(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function DetailBlock({
  title,
  children,
}: {
  title: string
  children: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </div>
      <pre className="overflow-x-auto rounded-md border bg-background/80 px-3 py-2 font-mono text-xs text-foreground whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  )
}

function AuditFilterLink({
  label,
  displayValue,
  search,
}: {
  label: string
  displayValue: string
  search: AuditPageSearch
}) {
  const navigate = useNavigate()

  return (
    <div className="text-xs text-muted-foreground">
      {label}:{' '}
      <button
        type="button"
        className="break-all font-mono text-foreground underline-offset-2 transition-colors hover:underline"
        onClick={() => {
          void navigate({
            to: routes.app.audit,
            search,
          })
        }}
      >
        {displayValue}
      </button>
    </div>
  )
}

export function AuditEventCard({
  event,
  showSubject = true,
  showActor = true,
  showEntity = true,
}: AuditEventCardProps) {
  const [open, setOpen] = useState(false)
  const afterStatus = getStringValue(event.after, 'status')
  const summary = getAuditEventSummary(event)
  const contextRows = [
    event.event_source ? { label: 'Source', value: event.event_source } : null,
    event.request_id ? { label: 'Request', value: event.request_id } : null,
    event.role_id ? { label: 'Role', value: event.role_id } : null,
    event.root_entity_id
      ? { label: 'Root entity', value: event.root_entity_id }
      : null,
    event.ip_address ? { label: 'IP', value: event.ip_address } : null,
    event.user_agent ? { label: 'User agent', value: event.user_agent } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row))

  const hasBefore = hasPayload(event.before)
  const hasAfter = hasPayload(event.after)
  const hasMetadata = hasPayload(event.metadata)
  const hasInspectableDetails =
    hasBefore || hasAfter || hasMetadata || contextRows.length > 0

  const subjectDisplay =
    event.subject_email_snapshot || event.subject_user_id || null

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium">
            {formatToken(
              event.event_type.split('.').at(-1) ?? event.event_type
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDateTime(event.occurred_at, 'Unknown')}
          </div>
          {showSubject && subjectDisplay ? (
            event.subject_user_id ? (
              <AuditFilterLink
                label="Subject"
                displayValue={subjectDisplay}
                search={{ subjectUserId: event.subject_user_id }}
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                Subject: {subjectDisplay}
              </div>
            )
          ) : null}
          {showActor && event.actor_user_id ? (
            <AuditFilterLink
              label="Actor"
              displayValue={event.actor_user_id}
              search={{ actorUserId: event.actor_user_id }}
            />
          ) : null}
          {showEntity && event.entity_id ? (
            <AuditFilterLink
              label="Entity"
              displayValue={event.entity_id}
              search={{ entityId: event.entity_id }}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatToken(event.event_category)}</Badge>
          {afterStatus ? (
            <AppStatusBadge tone={getAuditEventTone(event)}>
              {formatToken(afterStatus)}
            </AppStatusBadge>
          ) : null}
        </div>
      </div>

      <div className="mt-3 text-sm text-muted-foreground">{summary}</div>

      {event.reason && event.reason !== summary ? (
        <div className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          {event.reason}
        </div>
      ) : null}

      {hasInspectableDetails ? (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
          <CollapsibleTrigger
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={
              open
                ? `Hide details for ${event.event_type}`
                : `Show details for ${event.event_type}`
            }
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform',
                open ? 'rotate-180' : null
              )}
            />
            {open ? 'Hide event details' : 'Show event details'}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {contextRows.length ? (
              <dl className="grid gap-2 rounded-md border bg-background/70 px-3 py-2 text-xs sm:grid-cols-2">
                {contextRows.map((row) => (
                  <div key={row.label} className="min-w-0 space-y-0.5">
                    <dt className="font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {row.label}
                    </dt>
                    <dd className="break-all text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {hasBefore && event.before ? (
              <DetailBlock title="Before">{formatJson(event.before)}</DetailBlock>
            ) : null}
            {hasAfter && event.after ? (
              <DetailBlock title="After">{formatJson(event.after)}</DetailBlock>
            ) : null}
            {hasMetadata && event.metadata ? (
              <DetailBlock title="Metadata">
                {formatJson(event.metadata)}
              </DetailBlock>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
