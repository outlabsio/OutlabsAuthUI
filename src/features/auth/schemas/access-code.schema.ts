import { z } from 'zod'

export const accessCodeRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
})

export const accessCodeVerifySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  code: z
    .string()
    .trim()
    .min(1, 'Access code is required.')
    .max(32, 'Access code is too long.')
    .regex(/^[0-9\-\s]+$/, 'Enter the code from your email.'),
})

export type AccessCodeRequestFormValues = z.infer<
  typeof accessCodeRequestSchema
>
export type AccessCodeVerifyFormValues = z.infer<typeof accessCodeVerifySchema>
