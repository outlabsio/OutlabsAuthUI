import type { GetAuditEventsParams } from '@/features/audit/types/audit.types'

export const auditKeys = {
  all: ['audit'] as const,
  eventsRoot: () => [...auditKeys.all, 'events'] as const,
  events: (params: GetAuditEventsParams = {}) =>
    [
      ...auditKeys.eventsRoot(),
      {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        category: params.category,
        eventType: params.eventType,
        subjectUserId: params.subjectUserId,
        actorUserId: params.actorUserId,
        entityId: params.entityId,
        occurredFrom: params.occurredFrom,
        occurredTo: params.occurredTo,
      },
    ] as const,
}
