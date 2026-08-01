import { z } from 'zod'

import type { UserDetailsPageSearch } from '@/features/users/types/users.types'

const userDetailsTabSchema = z.enum(['details', 'access', 'history'])

export const userDetailsSearchSchema = z.object({
  tab: userDetailsTabSchema.optional(),
  source: z.enum(['entities']).optional(),
  sourceEntityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  sourceScopeRootId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  sourceSearch: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
})

export function parseUserDetailsSearch(search: unknown): UserDetailsPageSearch {
  return userDetailsSearchSchema.parse(search)
}
