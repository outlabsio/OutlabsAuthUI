import { z } from 'zod'

export const changeAccountPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Enter your current password.')
      .max(128, 'Password must be 128 characters or fewer.'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(128, 'Password must be 128 characters or fewer.'),
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords must match.',
      })
    }
  })

export type ChangeAccountPasswordFormValues = z.infer<
  typeof changeAccountPasswordSchema
>
