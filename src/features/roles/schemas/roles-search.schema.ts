import { z } from 'zod'

import type { RolesPageSearch } from '@/features/roles/types/roles.types'

export const rolesSearchSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  roleType: z
    .enum(['all', 'global', 'root', 'entity'])
    .optional()
    .transform((value) => value ?? 'all'),
  scopeMode: z
    .enum(['all', 'hierarchy', 'entity_only'])
    .optional()
    .transform((value) => value ?? 'all'),
  scopeRootId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  assignableType: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  usage: z
    .enum(['all', 'auto', 'manual'])
    .optional()
    .transform((value) => value ?? 'all'),
  system: z
    .enum(['all', 'system', 'custom'])
    .optional()
    .transform((value) => value ?? 'all'),
})

export function parseRolesSearch(search: unknown): RolesPageSearch {
  return rolesSearchSchema.parse(search)
}
