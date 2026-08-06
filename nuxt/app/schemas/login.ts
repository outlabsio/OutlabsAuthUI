import { z } from 'zod'

// A4 — one Zod schema per form, consumed by UForm via Standard Schema. Ported from
// src/features/auth/schemas/login.schema.ts (messages identical for E2E parity).
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.')
})

export type LoginSchema = z.output<typeof loginSchema>
