import { z } from 'zod'

import type { PermissionsPageSearch } from '@/features/permissions/types/permissions.types'

export const permissionsSearchSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  resource: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  system: z
    .enum(['all', 'system', 'custom'])
    .optional()
    .transform((value) => value ?? 'all'),
  status: z
    .enum(['all', 'active', 'inactive'])
    .optional()
    .transform((value) => value ?? 'all'),
  tag: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
})

export function parsePermissionsSearch(search: unknown): PermissionsPageSearch {
  return permissionsSearchSchema.parse(search)
}
