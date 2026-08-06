import { z } from 'zod'

// A4 — role create form. `name` is the machine slug; `display_name` is human-facing.
export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, hyphens or underscores.'),
  display_name: z.string().trim().min(1, 'Display name is required.'),
  description: z.string().trim().max(500).optional(),
  is_global: z.boolean().optional()
})

export type CreateRoleSchema = z.output<typeof createRoleSchema>

export const updateRoleSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required.'),
  description: z.string().trim().max(500).optional()
})

export type UpdateRoleSchema = z.output<typeof updateRoleSchema>
