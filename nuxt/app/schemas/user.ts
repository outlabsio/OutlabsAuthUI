import { z } from 'zod'

// A4 — reference resource form schema. Typed with z.output; UForm validates before @submit.
export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  is_superuser: z.boolean().optional()
})

export type CreateUserSchema = z.output<typeof createUserSchema>
