import { z } from 'zod'

export const inviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  entityId: z.string().trim().optional(),
  roleIds: z.array(z.string()),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
