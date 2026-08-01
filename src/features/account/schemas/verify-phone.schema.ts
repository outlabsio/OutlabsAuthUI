import { z } from 'zod'

export const verifyPhoneSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Enter the verification code.')
    .max(12, 'Verification code is too long.'),
})

export type VerifyPhoneFormValues = z.infer<typeof verifyPhoneSchema>
