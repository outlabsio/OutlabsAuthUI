import { z } from 'zod'

export const updateUserStatusSchema = z
  .object({
    status: z
      .enum(['active', 'suspended', 'banned'], {
        message: 'Select a valid account status.',
      })
      .optional(),
    suspendedUntil: z.string().optional(),
    reason: z
      .string()
      .trim()
      .max(500, 'Reason must be 500 characters or fewer.')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Select a new account status.',
      })
    }
  })

export type UpdateUserStatusFormValues = z.infer<typeof updateUserStatusSchema>
