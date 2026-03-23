import { z } from 'zod'

import { normalizeTagValues } from '@/lib/utils/tag-values'

const entityTypeValueSchema = z
  .string()
  .trim()
  .min(1, 'Entity types cannot be empty.')
  .max(50, 'Entity types must be 50 characters or fewer.')

export const entityTypeConfigFormSchema = z.object({
  structuralRootTypes: z
    .array(entityTypeValueSchema)
    .default([])
    .transform((values) => normalizeTagValues(values)),
  accessGroupRootTypes: z
    .array(entityTypeValueSchema)
    .default([])
    .transform((values) => normalizeTagValues(values)),
  structuralChildTypes: z
    .array(entityTypeValueSchema)
    .default([])
    .transform((values) => normalizeTagValues(values))
    .refine((values) => values.length > 0, 'Add at least one structural child type.'),
  accessGroupChildTypes: z
    .array(entityTypeValueSchema)
    .default([])
    .transform((values) => normalizeTagValues(values))
    .refine((values) => values.length > 0, 'Add at least one access-group child type.'),
}).refine(
  (value) =>
    value.structuralRootTypes.length > 0 ||
    value.accessGroupRootTypes.length > 0,
  {
    message: 'Configure at least one root entity type across the two classes.',
    path: ['structuralRootTypes'],
  }
)

export type EntityTypeConfigFormValues = z.infer<typeof entityTypeConfigFormSchema>
