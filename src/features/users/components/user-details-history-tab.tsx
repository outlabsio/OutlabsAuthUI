import type { UseQueryResult } from '@tanstack/react-query';

import { AppEmptyState } from '@/components/app/app-empty-state';
import { AppStatusBadge } from '@/components/app/app-status-badge';
import { Badge } from '@/components/ui/badge';
import {
  formatMembershipToken,
  getMembershipStatusTone,
} from '@/features/memberships/utils/membership-display';
import {
  DetailSection,
  SectionPaginationAction,
} from '@/features/users/components/user-details-section';
import type {
  UserAuditEventsResponse,
  UserMembershipHistoryResponse,
} from '@/features/users/types/users.types';
import {
  formatDateTime,
  formatToken,
  getAuditEventSummary,
  getAuditEventTone,
  getMembershipHistorySummary,
  getStringValue,
} from '@/features/users/utils/user-details-display';
import { getApiErrorMessage } from '@/lib/api/errors';

type UserDetailsHistoryTabProps = {
  activityTrackingFeatureEnabled: boolean;
  membershipRolesFeatureEnabled: boolean;
  auditEventsPage: number;
  membershipHistoryPage: number;
  auditEventsQuery: UseQueryResult<UserAuditEventsResponse>;
  membershipHistoryQuery: UseQueryResult<UserMembershipHistoryResponse>;
  setAuditEventsPage: (
    value: number | ((currentPage: number) => number),
  ) => void;
  setMembershipHistoryPage: (
    value: number | ((currentPage: number) => number),
  ) => void;
};

export function UserDetailsHistoryTab({
  activityTrackingFeatureEnabled,
  membershipRolesFeatureEnabled,
  auditEventsPage,
  membershipHistoryPage,
  auditEventsQuery,
  membershipHistoryQuery,
  setAuditEventsPage,
  setMembershipHistoryPage,
}: UserDetailsHistoryTabProps) {
  return (
            <div className="grid gap-6 xl:grid-cols-2">
              <DetailSection
                title="Audit timeline"
                description="Recent cross-domain account events from the retained user audit stream."
                action={
                  <SectionPaginationAction
                    itemLabel="events"
                    total={auditEventsQuery.data?.total ?? 0}
                    page={auditEventsQuery.data?.page ?? auditEventsPage}
                    pages={auditEventsQuery.data?.pages ?? 0}
                    isPending={auditEventsQuery.isPending}
                    onPrevious={() => {
                      setAuditEventsPage((currentPage) =>
                        Math.max(1, currentPage - 1),
                      );
                    }}
                    onNext={() => {
                      setAuditEventsPage((currentPage) => currentPage + 1);
                    }}
                  />
                }
              >
                {!activityTrackingFeatureEnabled ? (
                  <AppEmptyState
                    title="Audit timeline unavailable"
                    description="This backend does not advertise activity tracking, so audit events are not available for this account."
                    compact
                  />
                ) : auditEventsQuery.isError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                    {getApiErrorMessage(
                      auditEventsQuery.error,
                      'The user audit timeline could not be loaded.',
                    )}
                  </div>
                ) : auditEventsQuery.data?.items.length ? (
                  <div className="space-y-3">
                    {auditEventsQuery.data.items.map((event) => {
                      const afterStatus = getStringValue(event.after, 'status');

                      return (
                        <div
                          key={event.id}
                          className="rounded-lg border bg-muted/30 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="font-medium">
                                {formatToken(
                                  event.event_type.split('.').at(-1) ??
                                    event.event_type,
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(event.occurred_at, 'Unknown')}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {formatToken(event.event_category)}
                              </Badge>
                              {afterStatus ? (
                                <AppStatusBadge tone={getAuditEventTone(event)}>
                                  {formatToken(afterStatus)}
                                </AppStatusBadge>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">
                            {getAuditEventSummary(event)}
                          </div>
                          {event.reason &&
                          event.reason !== getAuditEventSummary(event) ? (
                            <div className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                              {event.reason}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No audit events are currently available for this account.
                  </div>
                )}
              </DetailSection>

              <DetailSection
                title="Membership history"
                description="Append-only membership lifecycle history for this retained identity."
                action={
                  <SectionPaginationAction
                    itemLabel="history events"
                    total={membershipHistoryQuery.data?.total ?? 0}
                    page={
                      membershipHistoryQuery.data?.page ?? membershipHistoryPage
                    }
                    pages={membershipHistoryQuery.data?.pages ?? 0}
                    isPending={membershipHistoryQuery.isPending}
                    onPrevious={() => {
                      setMembershipHistoryPage((currentPage) =>
                        Math.max(1, currentPage - 1),
                      );
                    }}
                    onNext={() => {
                      setMembershipHistoryPage((currentPage) => currentPage + 1);
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
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                    {getApiErrorMessage(
                      membershipHistoryQuery.error,
                      'The membership history could not be loaded.',
                    )}
                  </div>
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
                            <AppStatusBadge
                              tone={getMembershipStatusTone(event.status)}
                            >
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
                              <Badge
                                key={`${event.id}-${roleName}`}
                                variant="outline"
                              >
                                {roleName}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No membership history is currently available for this account.
                  </div>
                )}
              </DetailSection>
            </div>
  );
}
