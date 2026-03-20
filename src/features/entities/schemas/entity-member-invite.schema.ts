import { z } from 'zod'

export const entityMemberInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  roleIds: z.array(z.string()).default([]),
})

export type EntityMemberInviteFormValues = z.infer<typeof entityMemberInviteSchema>
