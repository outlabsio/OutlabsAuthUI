import { z } from 'zod'

import { normalizeTagValues } from '@/lib/utils/tag-values'

const entityClassSchema = z.enum(['structural', 'access_group'])
const entityTypeValueSchema = z
  .string()
  .trim()
  .min(1, 'Child types cannot be empty.')
  .max(50, 'Child types must be 50 characters or fewer.')
const maxMembersFieldSchema = z
  .string()
  .optional()
  .refine((value) => {
    if (!value || !value.trim()) {
      return true
    }

    const parsedValue = Number(value)
    return Number.isInteger(parsedValue) && parsedValue > 0
  }, 'Max members must be a whole number greater than zero.')

function isValidRegexPattern(value?: string) {
  if (!value || !value.trim()) {
    return true
  }

  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

export const rootGovernanceFormSchema = z.object({
  allowedChildClasses: z.array(entityClassSchema).default([]),
  allowedChildTypes: z
    .array(entityTypeValueSchema)
    .default([])
    .transform((values) => normalizeTagValues(values)),
  maxMembers: maxMembersFieldSchema,
  childNamePattern: z
    .string()
    .max(255, 'System-name pattern must be 255 characters or fewer.')
    .optional()
    .refine(isValidRegexPattern, 'System-name pattern must be a valid regular expression.'),
  childDisplayNamePattern: z
    .string()
    .max(255, 'Display-name pattern must be 255 characters or fewer.')
    .optional()
    .refine(isValidRegexPattern, 'Display-name pattern must be a valid regular expression.'),
  childSlugPattern: z
    .string()
    .max(255, 'Slug pattern must be 255 characters or fewer.')
    .optional()
    .refine(isValidRegexPattern, 'Slug pattern must be a valid regular expression.'),
  childNamingGuidance: z
    .string()
    .max(1000, 'Naming guidance must be 1000 characters or fewer.')
    .optional(),
})

export type RootGovernanceFormValues = z.infer<typeof rootGovernanceFormSchema>
