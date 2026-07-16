import { useEffect, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppToolbar } from '@/components/app/app-toolbar'
import { Button } from '@/components/ui/button'
import { getAuditEventsQueryOptions } from '@/features/audit/api/audit.query-options'
import { AuditEventCard } from '@/features/audit/components/audit-event-card'
import { AuditFiltersBar } from '@/features/audit/components/audit-filters-bar'
import type {
  AuditFilters,
  AuditPageSearch,
} from '@/features/audit/types/audit.types'
import {
  auditFiltersToSearch,
  auditSearchToFilters,
} from '@/features/audit/types/audit.types'
import { useActorPermissions } from '@/features/auth/hooks/use-actor-permissions'
import { getApiErrorMessage } from '@/lib/api/errors'

const emptyFilters: AuditFilters = {
  category: '',
  eventType: '',
  subjectUserId: '',
  actorUserId: '',
  entityId: '',
  occurredFrom: '',
  occurredTo: '',
}

function toQueryIso(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }

  return parsed.toISOString()
}

type AuditPageProps = {
  search: AuditPageSearch
  onSearchChange: (next: AuditPageSearch) => void
}

export function AuditPage({ search, onSearchChange }: AuditPageProps) {
  const actorPermissions = useActorPermissions()
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(() =>
    auditSearchToFilters(search)
  )
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(() =>
    auditSearchToFilters(search)
  )
  const [page, setPage] = useState(1)

  useEffect(() => {
    const next = auditSearchToFilters(search)
    setDraftFilters(next)
    setAppliedFilters(next)
    setPage(1)
  }, [
    search.actorUserId,
    search.category,
    search.entityId,
    search.eventType,
    search.occurredFrom,
    search.occurredTo,
    search.subjectUserId,
  ])

  const canReadAudit = actorPermissions.has('user:read')
  const queryParams = {
    page,
    limit: 20,
    category: appliedFilters.category.trim() || undefined,
    eventType: appliedFilters.eventType.trim() || undefined,
    subjectUserId: appliedFilters.subjectUserId.trim() || undefined,
    actorUserId: appliedFilters.actorUserId.trim() || undefined,
    entityId: appliedFilters.entityId.trim() || undefined,
    occurredFrom: toQueryIso(appliedFilters.occurredFrom),
    occurredTo: toQueryIso(appliedFilters.occurredTo),
  }
  const auditEventsQuery = useQuery({
    ...getAuditEventsQueryOptions(queryParams),
    enabled: canReadAudit,
  })

  if (actorPermissions.isPending) {
    return <AppLoadingState title="Loading audit workspace" />
  }

  if (actorPermissions.error) {
    return (
      <AppPage title="Audit" hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(
            actorPermissions.error,
            'The audit workspace could not load permissions for this session.'
          )}
        </AppErrorState>
      </AppPage>
    )
  }

  if (!canReadAudit) {
    return (
      <AppPage title="Audit" hideTitle padded>
        <AppEmptyState
          title="Audit workspace unavailable"
          description="Your current session cannot read audit events. user:read is required."
          compact
        />
      </AppPage>
    )
  }

  const events = auditEventsQuery.data?.items ?? []
  const total = auditEventsQuery.data?.total ?? 0
  const currentPage = auditEventsQuery.data?.page ?? page
  const pages = auditEventsQuery.data?.pages ?? 0
  const auditSummary = (
    <div className="hidden min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground xl:flex">
      <span>
        <span className="font-medium text-foreground">{total}</span> events
      </span>
      {pages > 0 ? (
        <span>
          Page{' '}
          <span className="font-medium text-foreground">{currentPage}</span> of{' '}
          <span className="font-medium text-foreground">{pages}</span>
        </span>
      ) : null}
    </div>
  )

  return (
    <AppPage
      className="flex-1 min-h-0 gap-0 overflow-hidden"
      title="Audit"
      hideTitle
      shellMeta={auditSummary}
      shellAction={
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={auditEventsQuery.isPending || currentPage <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage((current) => current + 1)}
            disabled={
              auditEventsQuery.isPending || pages === 0 || currentPage >= pages
            }
          >
            Next
          </Button>
        </div>
      }
      action={
        <AppToolbar
          variant="plain"
          className="border-b bg-background/95 px-4 py-3"
        >
          <AuditFiltersBar
            filters={draftFilters}
            onChange={setDraftFilters}
            onApply={() => {
              setAppliedFilters(draftFilters)
              setPage(1)
              onSearchChange(auditFiltersToSearch(draftFilters))
            }}
            onReset={() => {
              setDraftFilters(emptyFilters)
              setAppliedFilters(emptyFilters)
              setPage(1)
              onSearchChange({})
            }}
          />
        </AppToolbar>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {auditEventsQuery.isError ? (
          <AppErrorState>
            {getApiErrorMessage(
              auditEventsQuery.error,
              'Audit events could not be loaded.'
            )}
          </AppErrorState>
        ) : auditEventsQuery.isPending ? (
          <AppLoadingState title="Loading audit events" />
        ) : events.length ? (
          <div className="space-y-3">
            {events.map((event) => (
              <AuditEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <AppEmptyState
            title="No audit events"
            description="No events match the current filters."
            compact
          />
        )}
      </div>
    </AppPage>
  )
}
