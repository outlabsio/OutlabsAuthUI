import { queryOptions } from '@tanstack/react-query'

import { auditKeys } from '@/features/audit/api/audit.keys'
import { getAuditEvents } from '@/features/audit/api/get-audit-events'
import type { GetAuditEventsParams } from '@/features/audit/types/audit.types'

export function getAuditEventsQueryOptions(params: GetAuditEventsParams = {}) {
  return queryOptions({
    queryKey: auditKeys.events(params),
    queryFn: () => getAuditEvents(params),
  })
}
