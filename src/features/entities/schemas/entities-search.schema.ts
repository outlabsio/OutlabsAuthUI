import { z } from 'zod'

import type { EntitiesPageSearch } from '@/features/entities/types/entities.types'

export const entitiesSearchSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  scopeRootId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
})

export function parseEntitiesSearch(search: unknown): EntitiesPageSearch {
  return entitiesSearchSchema.parse(search)
}
