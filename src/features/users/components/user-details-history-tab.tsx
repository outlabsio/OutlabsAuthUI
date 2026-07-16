import type { UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AuditEventCard } from '@/features/audit/components/audit-event-card'
import {
  formatMembershipToken,
  getMembershipStatusTone,
} from '@/features/memberships/utils/membership-display'
import {
  DetailSection,
  SectionPaginationAction,
} from '@/features/users/components/user-details-section'
import type {
  UserAuditEventsResponse,
  UserMembershipHistoryResponse,
} from '@/features/users/types/users.types'
import {
  formatDateTime,
  formatToken,
  getMembershipHistorySummary,
} from '@/features/users/utils/user-details-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

type UserDetailsHistoryTabProps = {
  userId: string
  activityTrackingFeatureEnabled: boolean
  membershipRolesFeatureEnabled: boolean
  auditEventsPage: number
  membershipHistoryPage: number
  auditEventsQuery: UseQueryResult<UserAuditEventsResponse>
  membershipHistoryQuery: UseQueryResult<UserMembershipHistoryResponse>
  setAuditEventsPage: (
    value: number | ((currentPage: number) => number)
  ) => void
  setMembershipHistoryPage: (
    value: number | ((currentPage: number) => number)
  ) => void
}

export function UserDetailsHistoryTab({
  userId,
  activityTrackingFeatureEnabled,
  membershipRolesFeatureEnabled,
  auditEventsPage,
  membershipHistoryPage,
  auditEventsQuery,
  membershipHistoryQuery,
  setAuditEventsPage,
  setMembershipHistoryPage,
}: UserDetailsHistoryTabProps) {
  const navigate = useNavigate()

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <DetailSection
        title="Audit timeline"
        description="Recent cross-domain account events from the retained user audit stream."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {activityTrackingFeatureEnabled ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigate({
                      to: routes.app.audit,
                      search: {
                        subjectUserId: userId,
                      },
                    })
                  }}
                >
                  Open in Audit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigate({
                      to: routes.app.audit,
                      search: {
                        actorUserId: userId,
                      },
                    })
                  }}
                >
                  Open as actor
                </Button>
              </>
            ) : null}
            <SectionPaginationAction
              itemLabel="events"
              total={auditEventsQuery.data?.total ?? 0}
              page={auditEventsQuery.data?.page ?? auditEventsPage}
              pages={auditEventsQuery.data?.pages ?? 0}
              isPending={auditEventsQuery.isPending}
              onPrevious={() => {
                setAuditEventsPage((currentPage) =>
                  Math.max(1, currentPage - 1)
                )
              }}
              onNext={() => {
                setAuditEventsPage((currentPage) => currentPage + 1)
              }}
            />
          </div>
        }
      >
        {!activityTrackingFeatureEnabled ? (
          <AppEmptyState
            title="Audit timeline unavailable"
            description="This backend does not advertise activity tracking, so audit events are not available for this account."
            compact
          />
        ) : auditEventsQuery.isError ? (
          <AppErrorState>
            {getApiErrorMessage(
              auditEventsQuery.error,
              'The user audit timeline could not be loaded.'
            )}
          </AppErrorState>
        ) : auditEventsQuery.isPending ? (
          <AppEmptyState title="Loading audit timeline…" compact />
        ) : auditEventsQuery.data?.items.length ? (
          <div className="space-y-3">
            {auditEventsQuery.data.items.map((event) => (
              <AuditEventCard
                key={event.id}
                event={event}
                showSubject={false}
              />
            ))}
          </div>
        ) : (
          <AppEmptyState
            title="No audit events"
            description="No audit events are currently available for this account."
            compact
          />
        )}
      </DetailSection>

      <DetailSection
        title="Membership history"
        description="Append-only membership lifecycle history for this retained identity."
        action={
          <SectionPaginationAction
            itemLabel="history events"
            total={membershipHistoryQuery.data?.total ?? 0}
            page={membershipHistoryQuery.data?.page ?? membershipHistoryPage}
            pages={membershipHistoryQuery.data?.pages ?? 0}
            isPending={membershipHistoryQuery.isPending}
            onPrevious={() => {
              setMembershipHistoryPage((currentPage) =>
                Math.max(1, currentPage - 1)
              )
            }}
            onNext={() => {
              setMembershipHistoryPage((currentPage) => currentPage + 1)
            }}
          />
        }
      >
        {!membershipRolesFeatureEnabled ? (
          <AppEmptyState
            title="Membership history unavailable"
            description="This backend does not advertise entity hierarchy support, so membership history is not available for this account."
            compact
          />
        ) : membershipHistoryQuery.isError ? (
          <AppErrorState>
            {getApiErrorMessage(
              membershipHistoryQuery.error,
              'The membership history could not be loaded.'
            )}
          </AppErrorState>
        ) : membershipHistoryQuery.isPending ? (
          <AppEmptyState title="Loading membership history…" compact />
        ) : membershipHistoryQuery.data?.items.length ? (
          <div className="space-y-3">
            {membershipHistoryQuery.data.items.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border bg-muted/30 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {event.entity_display_name ??
                        event.entity_path.at(-1) ??
                        event.entity_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(event.event_at, 'Unknown')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AppStatusBadge tone={getMembershipStatusTone(event.status)}>
                      {formatMembershipToken(event.status)}
                    </AppStatusBadge>
                    <Badge variant="outline">
                      {formatToken(event.event_type)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  {getMembershipHistorySummary(event)}
                </div>
                {event.entity_path.length > 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {event.entity_path.join(' / ')}
                  </div>
                ) : null}
                {event.role_names.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.role_names.map((roleName) => (
                      <Badge key={`${event.id}-${roleName}`} variant="outline">
                        {roleName}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <AppEmptyState
            title="No membership history"
            description="No membership history is currently available for this account."
            compact
          />
        )}
      </DetailSection>
    </div>
  )
}
