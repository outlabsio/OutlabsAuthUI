import { z } from 'zod'

// A4 — role create form. `name` is the machine slug; `display_name` is human-facing. role_type
// (global/root/entity) drives is_global + which entity is required; assignable_at_types is handled as
// comma-separated dialog state (not here) and normalized on submit.
export const createRoleSchema = z
  .object({
    role_type: z.enum(['global', 'root', 'entity']),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, hyphens or underscores.'),
    display_name: z.string().trim().min(1, 'Display name is required.'),
    description: z.string().trim().max(500).optional(),
    root_entity_id: z.string().optional(),
    scope_entity_id: z.string().optional(),
    scope: z.enum(['hierarchy', 'entity_only']),
    status: z.enum(['active', 'inactive']),
    is_auto_assigned: z.boolean(),
    permissions: z.array(z.string()).optional()
  })
  .refine(v => v.role_type !== 'root' || !!v.root_entity_id, {
    path: ['root_entity_id'],
    message: 'Pick the root organization that owns this role.'
  })
  .refine(v => v.role_type !== 'entity' || !!v.scope_entity_id, {
    path: ['scope_entity_id'],
    message: 'Pick the entity where this role is defined.'
  })

export type CreateRoleSchema = z.output<typeof createRoleSchema>

// Edit — root/scope entity + name are fixed after creation; the rest is editable.
export const updateRoleSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required.'),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['hierarchy', 'entity_only']),
  status: z.enum(['active', 'inactive']),
  is_auto_assigned: z.boolean(),
  permissions: z.array(z.string()).optional()
})

export type UpdateRoleSchema = z.output<typeof updateRoleSchema>
