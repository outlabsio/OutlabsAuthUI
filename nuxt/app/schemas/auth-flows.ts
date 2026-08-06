import { z } from 'zod'

// A4 — shared Zod schemas for the passwordless / recovery / invite auth forms.

export const emailRequestSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.')
})
export type EmailRequestSchema = z.output<typeof emailRequestSchema>

// Note: the access code has no schema — it's entered via UPinInput, whose fixed length
// (6 digits) is the validation; the verify button stays disabled until all slots are filled.

// Used by both reset-password and accept-invite (set a brand-new password + confirm).
export const setPasswordSchema = z
  .object({
    new_password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
    confirm_password: z.string()
  })
  .refine(value => value.new_password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords must match.'
  })
export type SetPasswordSchema = z.output<typeof setPasswordSchema>
