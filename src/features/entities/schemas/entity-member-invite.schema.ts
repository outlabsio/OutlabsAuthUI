import { z } from 'zod'

export const entityMemberInviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  roleIds: z.array(z.string()).default([]),
})

export type EntityMemberInviteFormValues = z.infer<typeof entityMemberInviteSchema>
