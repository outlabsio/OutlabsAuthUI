import { z } from 'zod'

export const updateAccountProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .max(100, 'First name must be 100 characters or fewer.'),
  lastName: z
    .string()
    .trim()
    .max(100, 'Last name must be 100 characters or fewer.'),
  email: z.email('Enter a valid email address.'),
})

export type UpdateAccountProfileFormValues = z.infer<
  typeof updateAccountProfileSchema
>
