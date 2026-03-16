import { z } from 'zod'

export const inviteUserSchema = z.object({
  email: z.email('Enter a valid email address.'),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  entityId: z.string().trim().optional(),
  roleIds: z.array(z.string()),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
