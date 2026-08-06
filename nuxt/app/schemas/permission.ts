import { z } from 'zod'

// A4 — permission create form. `name` follows the resource:action convention.
export const createPermissionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .regex(/^[a-z0-9_:.-]+$/, 'Use lowercase letters, numbers, and : _ . - only.'),
  display_name: z.string().trim().min(1, 'Display name is required.'),
  description: z.string().trim().max(500).optional()
})

export type CreatePermissionSchema = z.output<typeof createPermissionSchema>
