import { z } from 'zod'

export const createUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Email is required.')
      .email('Enter a valid email address.'),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(128, 'Password must be 128 characters or fewer.'),
    confirmPassword: z.string(),
    rootEntityId: z.string().trim().optional(),
    isSuperuser: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords must match.',
      })
    }
  })

export type CreateUserFormValues = z.infer<typeof createUserSchema>
