import { useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { Button } from '@/components/ui/button'
import { getAuditEventsQueryOptions } from '@/features/audit/api/audit.query-options'
import { AuditEventCard } from '@/features/audit/components/audit-event-card'
import { useActorPermissions } from '@/features/auth/hooks/use-actor-permissions'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

type EntityActivityPanelProps = {
  entityId: string
  entityDisplayName: string
}

export function EntityActivityPanel({
  entityId,
  entityDisplayName,
}: EntityActivityPanelProps) {
  const navigate = useNavigate()
  const actorPermissions = useActorPermissions()
  const [page, setPage] = useState(1)
  const canReadAudit = actorPermissions.has('user:read')

  const auditEventsQuery = useQuery({
    ...getAuditEventsQueryOptions({
      page,
      limit: 10,
      entityId,
    }),
    enabled: canReadAudit && Boolean(entityId),
  })

  if (actorPermissions.isPending) {
    return <AppLoadingState title="Loading entity activity" />
  }

  if (!canReadAudit) {
    return (
      <AppEmptyState
        title="Activity unavailable"
        description="Your current session cannot read audit events. user:read is required."
        compact
      />
    )
  }

  const events = auditEventsQuery.data?.items ?? []
  const total = auditEventsQuery.data?.total ?? 0
  const currentPage = auditEventsQuery.data?.page ?? page
  const pages = auditEventsQuery.data?.pages ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Recent audit events tied to {entityDisplayName}.
          {total > 0 ? ` ${total} retained.` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigate({
                to: routes.app.audit,
                search: {
                  entityId,
                },
              })
            }}
          >
            Open in Audit
          </Button>
        </div>
      </div>

      {auditEventsQuery.isError ? (
        <AppErrorState>
          {getApiErrorMessage(
            auditEventsQuery.error,
            'Entity activity could not be loaded.'
          )}
        </AppErrorState>
      ) : auditEventsQuery.isPending ? (
        <AppLoadingState title="Loading entity activity" />
      ) : events.length ? (
        <div className="space-y-3">
          {events.map((event) => (
            <AuditEventCard
              key={event.id}
              event={event}
              showEntity={false}
            />
          ))}
        </div>
      ) : (
        <AppEmptyState
          title="No entity activity"
          description="No retained audit events reference this entity yet."
          compact
        />
      )}
    </div>
  )
}
