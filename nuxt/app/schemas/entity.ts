import { z } from 'zod'

// Entity governance form — child limits + naming rules for children. allowed_child_classes/types are
// handled as dialog state (checkboxes + comma text); this validates the regex patterns + max members.
const isValidRegex = (value?: string) => {
  if (!value || !value.trim()) return true
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

export const governanceSchema = z.object({
  max_members: z
    .string()
    .optional()
    .refine(v => !v || !v.trim() || (Number.isInteger(Number(v)) && Number(v) > 0), 'Must be a whole number greater than zero.'),
  child_name_pattern: z
    .string()
    .max(255)
    .optional()
    .refine(isValidRegex, 'Must be a valid regular expression.'),
  child_display_name_pattern: z
    .string()
    .max(255)
    .optional()
    .refine(isValidRegex, 'Must be a valid regular expression.'),
  child_slug_pattern: z
    .string()
    .max(255)
    .optional()
    .refine(isValidRegex, 'Must be a valid regular expression.'),
  child_naming_guidance: z.string().max(1000).optional()
})

export type GovernanceSchema = z.output<typeof governanceSchema>
