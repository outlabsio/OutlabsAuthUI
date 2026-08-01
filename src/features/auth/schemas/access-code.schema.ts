import { z } from 'zod'

const e164Phone = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{6,14}$/,
    'Phone must be E.164 format (e.g. +15551234567).'
  )

export const accessCodeRequestSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('email'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required.')
      .email('Enter a valid email address.'),
  }),
  z.object({
    channel: z.literal('whatsapp'),
    phone: e164Phone,
  }),
  z.object({
    channel: z.literal('sms'),
    phone: e164Phone,
  }),
])

export const accessCodeVerifySchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('email'),
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
  }),
  z.object({
    channel: z.literal('whatsapp'),
    phone: e164Phone,
    code: z
      .string()
      .trim()
      .min(1, 'Access code is required.')
      .max(32, 'Access code is too long.')
      .regex(/^[0-9\-\s]+$/, 'Enter the code from WhatsApp.'),
  }),
  z.object({
    channel: z.literal('sms'),
    phone: e164Phone,
    code: z
      .string()
      .trim()
      .min(1, 'Access code is required.')
      .max(32, 'Access code is too long.')
      .regex(/^[0-9\-\s]+$/, 'Enter the code from your SMS.'),
  }),
])

export type AccessCodeRequestFormValues = z.infer<
  typeof accessCodeRequestSchema
>
export type AccessCodeVerifyFormValues = z.infer<typeof accessCodeVerifySchema>
export type AccessCodeChannel = AccessCodeRequestFormValues['channel']
