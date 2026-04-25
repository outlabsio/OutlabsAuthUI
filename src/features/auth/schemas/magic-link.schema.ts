import { z } from 'zod'

export const magicLinkRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
})

export type MagicLinkRequestFormValues = z.infer<typeof magicLinkRequestSchema>
