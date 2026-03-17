import { z } from 'zod'

export const roleConditionFormSchema = z.object({
  attribute: z
    .string()
    .trim()
    .min(3, 'Attribute path is required.')
    .max(200, 'Attribute path must be 200 characters or fewer.'),
  operator: z
    .string()
    .trim()
    .min(2, 'Operator is required.')
    .max(30, 'Operator must be 30 characters or fewer.'),
  valueType: z.enum(['string', 'integer', 'float', 'boolean', 'list']).default('string'),
  value: z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? ''),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer.')
    .optional()
    .transform((value) => value || ''),
  conditionGroupId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || ''),
})

export type RoleConditionFormValues = z.infer<typeof roleConditionFormSchema>
