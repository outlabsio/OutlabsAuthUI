import { z } from 'zod'

// A4 — reference resource form schema. Typed with z.output; UForm validates before @submit.
export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  is_superuser: z.boolean().optional()
})

export type CreateUserSchema = z.output<typeof createUserSchema>

// Invite by email (no password). entity_id + role_ids are handled as extra dialog state, not here.
export const inviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  is_superuser: z.boolean().optional()
})

export type InviteUserSchema = z.output<typeof inviteUserSchema>

export const updateUserSchema = z.object({
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .refine(
      value => value === '' || /^\+[1-9]\d{6,14}$/.test(value),
      'Phone must be E.164 format (e.g. +15551234567), or left blank.'
    )
})

export type UpdateUserSchema = z.output<typeof updateUserSchema>
