import { z } from 'zod'

// A4 — account forms. Field names are snake_case to send straight to the API (no mapping).

const optionalE164Phone = z
  .string()
  .trim()
  .refine(
    value => value === '' || /^\+[1-9]\d{6,14}$/.test(value),
    'Phone must be E.164 format (e.g. +15551234567), or left blank.'
  )

export const updateProfileSchema = z.object({
  first_name: z.string().trim().max(100, 'First name must be 100 characters or fewer.'),
  last_name: z.string().trim().max(100, 'Last name must be 100 characters or fewer.'),
  phone: optionalE164Phone
})

export type UpdateProfileSchema = z.output<typeof updateProfileSchema>

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.').max(128),
    new_password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
    confirm_password: z.string()
  })
  .refine(value => value.new_password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords must match.'
  })

export type ChangePasswordSchema = z.output<typeof changePasswordSchema>
