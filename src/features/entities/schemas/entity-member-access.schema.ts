import { z } from 'zod'

export const entityMemberAccessSchema = z
  .object({
    userId: z.string().trim().min(1, 'Select a user.'),
    roleIds: z.array(z.string()).default([]),
    status: z.enum(['active', 'suspended']),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    reason: z
      .string()
      .trim()
      .max(500, 'Reason must be 500 characters or fewer.')
      .optional(),
  })
  .refine(
    (value) => {
      if (!value.validFrom || !value.validUntil) {
        return true
      }

      return new Date(value.validUntil).getTime() >= new Date(value.validFrom).getTime()
    },
    {
      message: 'Valid until must be after valid from.',
      path: ['validUntil'],
    }
  )

export type EntityMemberAccessFormValues = z.infer<typeof entityMemberAccessSchema>
