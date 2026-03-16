import { z } from 'zod'

export function createDeleteUserSchema(expectedEmail: string) {
  return z.object({
    email: z
      .string()
      .trim()
      .email('Enter a valid email address.')
      .refine((value) => value === expectedEmail, {
        message: `Type ${expectedEmail} to confirm deletion.`,
      }),
  })
}

export type DeleteUserFormValues = {
  email: string
}
