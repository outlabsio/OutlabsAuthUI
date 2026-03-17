import { z } from 'zod'

export const roleFormSchema = z
  .object({
    roleType: z.enum(['global', 'root', 'entity']),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name must be 100 characters or fewer.'),
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name is required.')
      .max(200, 'Display name must be 200 characters or fewer.'),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be 500 characters or fewer.')
      .optional()
      .transform((value) => value || ''),
    rootEntityId: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || ''),
    scopeEntityId: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || ''),
    scope: z.enum(['hierarchy', 'entity_only']).default('hierarchy'),
    isAutoAssigned: z.boolean().default(false),
    assignableAtTypes: z.array(z.string()).default([]),
    permissionNames: z.array(z.string()).default([]),
  })
  .superRefine((value, context) => {
    if (value.roleType === 'root' && !value.rootEntityId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rootEntityId'],
        message: 'Pick the root organization that owns this role.',
      })
    }

    if (value.roleType === 'entity' && !value.scopeEntityId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeEntityId'],
        message: 'Pick the entity where this role is defined.',
      })
    }

    if (value.roleType !== 'entity' && value.isAutoAssigned) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isAutoAssigned'],
        message: 'Auto-assigned roles must be defined at an entity.',
      })
    }
  })

export type RoleFormValues = z.infer<typeof roleFormSchema>
