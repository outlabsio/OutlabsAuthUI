import { z } from 'zod'

import type { UsersPageSearch } from '@/features/users/types/users.types'

export const userStatusFilterSchema = z.enum([
  'active',
  'invited',
  'suspended',
  'banned',
])

export const usersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  status: userStatusFilterSchema.optional(),
  rootEntityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
})

export function parseUsersSearch(search: unknown): UsersPageSearch {
  return usersSearchSchema.parse(search)
}
