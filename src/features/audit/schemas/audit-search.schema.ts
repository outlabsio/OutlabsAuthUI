import { z } from 'zod'

import type { AuditPageSearch } from '@/features/audit/types/audit.types'

export const auditSearchSchema = z.object({
  category: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  eventType: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  subjectUserId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  actorUserId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  entityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  occurredFrom: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  occurredTo: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
})

export function parseAuditSearch(search: unknown): AuditPageSearch {
  return auditSearchSchema.parse(search)
}
