import { z } from 'zod'

// A4 — shared Zod schemas for the passwordless / recovery / invite auth forms.

// ── Unified sign-in (F1) ──

export const E164_PHONE_RE = /^\+[1-9]\d{6,14}$/

// An identifier "looks like a phone" when it's all dial characters (an email always has text
// around the @). Full E.164 (+ prefix) short-circuits straight to phone.
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('+') || /^[\d\s().-]{6,}$/.test(trimmed)
}

// Compose an E.164 number from a raw input + selected dial code. A raw value already in
// international format wins over the picker; national numbers get leading zeros stripped.
// Argentina is a special case for mobile-only OTP: people commonly provide the 10-digit
// national number without the international mobile marker 9. Add that marker only when the
// selected country is Argentina and this flow already establishes that the destination is a
// mobile number (SMS/WhatsApp), rather than applying it as a universal country rule.
// Dial codes are read as digits only: the picker shows shared-code territories as "+1-268"
// (Antigua), which must become +1268… in E.164.
export function normalizePhone(raw: string, dialCode: string, countryCode?: string): string {
  const prefix = `+${dialCode.replace(/\D/g, '')}`
  const argentina = countryCode === 'AR' && prefix === '+54'
  const trimmed = raw.trim().replace(/[\s().-]/g, '')
  if (trimmed.startsWith('+')) {
    if (argentina && /^\+54\d{10}$/.test(trimmed)) {
      return `+549${trimmed.slice(3)}`
    }
    return trimmed
  }
  const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '')
  if (argentina) {
    if (digits.length === 10) return `+549${digits}`
    if (digits.length === 11 && digits.startsWith('9')) return `+54${digits}`
  }
  return `${prefix}${digits}`
}

// The identifier step (AppAuthIdentifier): an email address, or a phone number whose country
// code comes from the picker. The component emits the raw value plus the picker's selection.
export const emailIdentifierSchema = z.object({
  identifier: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.')
})
export type IdentifierSchema = z.output<typeof emailIdentifierSchema>
export type AuthIdentifierSubmit = { identifier: string, dialCode: string, countryCode: string }

// The phone method's panel is phone-only (label + validation) — a phone number is required,
// never an email.
export const phoneIdentifierSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Phone number is required.')
    .superRefine((value, ctx) => {
      if (!looksLikePhone(value)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' })
        return
      }
      if (value.trim().startsWith('+') && !E164_PHONE_RE.test(value.trim().replace(/[\s().-]/g, ''))) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number with country code.' })
      }
    })
})

// The email method's combined form: email and password on one screen (see useSignInFlow).
export const emailPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.')
})
export type EmailPasswordSchema = z.output<typeof emailPasswordSchema>

// ── New passwords (signup, invitation, reset) ──

// Mirrors the backend's default policy (AuthConfig password_min_length 8, require_uppercase,
// require_digit, require_special_char, plus lowercase in validate_password_strength). The
// backend does not publish its policy yet, so a host with a stricter one still answers with
// INVALID_PASSWORD, which the forms show on the password field (passwordPolicyError).
export const PASSWORD_SPECIAL_CHARACTERS = '!@#$%^&*(),.?":{}|<>'
export const PASSWORD_POLICY_HINT = 'At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol such as ! @ # $ % or &.'

export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/\d/, 'Add a digit.')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, `Add a symbol (one of ${PASSWORD_SPECIAL_CHARACTERS}).`)

// ── Signup (F3) ──

export const registerSchema = z
  .object({
    email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
    first_name: z.string().trim().max(100).optional(),
    last_name: z.string().trim().max(100).optional(),
    password: newPasswordSchema,
    confirm_password: z.string()
  })
  .refine(value => value.password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords must match.'
  })
export type RegisterSchema = z.output<typeof registerSchema>

// ── One-time codes (sign-in, access code, recovery, phone verification) ──

// A code typed into UPinInput, whose model holds one number per box. Every box must hold a digit;
// the length is the deployment's (useAuthUiConfig().otpLength). A code the server refuses is set
// on the same `code` field by the flow (codeFieldError in utils/auth-messages.ts).
export function codeSchemaFor(length: number) {
  return z.object({
    code: z.array(z.unknown()).refine(
      digits => digits.length === length && digits.every(digit => typeof digit === 'number' && Number.isInteger(digit) && digit >= 0 && digit <= 9),
      `Enter all ${length} digits of the code.`
    )
  })
}
export type CodeSchema = { code: number[] }

// Used by both reset-password and accept-invite (set a brand-new password + confirm).
export const setPasswordSchema = z
  .object({
    new_password: newPasswordSchema,
    confirm_password: z.string()
  })
  .refine(value => value.new_password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords must match.'
  })
export type SetPasswordSchema = z.output<typeof setPasswordSchema>
