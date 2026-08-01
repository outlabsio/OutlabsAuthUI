import { z } from 'zod'

const optionalE164Phone = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^\+[1-9]\d{6,14}$/.test(value),
    'Phone must be E.164 format (e.g. +15551234567), or left blank.'
  )

export const updateUserProfileSchema = z.object({
  firstName: z.string().trim().max(100, 'First name must be 100 characters or fewer.'),
  lastName: z.string().trim().max(100, 'Last name must be 100 characters or fewer.'),
  email: z.email('Enter a valid email address.'),
  phone: optionalE164Phone,
})

export type UpdateUserProfileFormValues = z.infer<typeof updateUserProfileSchema>
