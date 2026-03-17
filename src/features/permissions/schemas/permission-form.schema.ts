import { z } from 'zod'

const permissionSegmentRegex = /^(\*|[a-zA-Z0-9_-]+)$/

export const permissionFormSchema = z.object({
  resource: z
    .string()
    .trim()
    .min(1, 'Resource is required.')
    .max(50, 'Resource must be 50 characters or fewer.')
    .regex(
      permissionSegmentRegex,
      'Use letters, numbers, underscores, hyphens, or *.'
    ),
  action: z
    .string()
    .trim()
    .min(1, 'Action is required.')
    .max(50, 'Action must be 50 characters or fewer.')
    .regex(
      permissionSegmentRegex,
      'Use letters, numbers, underscores, hyphens, or *.'
    ),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(200, 'Display name must be 200 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must be 1000 characters or fewer.')
    .optional()
    .transform((value) => value || ''),
  tagsText: z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? ''),
  isSystem: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export type PermissionFormValues = z.infer<typeof permissionFormSchema>
