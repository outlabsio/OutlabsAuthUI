import { z } from 'zod'

export const abacConditionGroupFormSchema = z.object({
  operator: z.enum(['AND', 'OR']).default('AND'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer.')
    .optional()
    .transform((value) => value || ''),
})

export type AbacConditionGroupFormValues = z.infer<
  typeof abacConditionGroupFormSchema
>
