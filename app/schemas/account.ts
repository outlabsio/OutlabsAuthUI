import { z } from 'zod'
import { newPasswordSchema, phoneIdentifierSchema } from '~/schemas/auth-flows'

// Account (self-service) forms. Field names are snake_case to send straight to the API.

// The profile's names. outlabs-auth accepts a name or no name, but never clears one once set
// (validate_name rejects an empty value), so a name the account already has is required, and a
// name it does not have is optional and only sent when typed (the form sends changed fields
// only). Without that, an invited account with no name could not save anything (F-095).
export function profileSchemaFor(current: { first_name?: string | null, last_name?: string | null }) {
  const name = (label: string, isSet: boolean) => {
    const base = z.string().trim().max(100, `${label} must be 100 characters or fewer.`)
    return isSet ? base.min(1, `Enter your ${label.toLowerCase()}. It can be changed but not removed.`) : base
  }
  return z.object({
    first_name: name('First name', Boolean(current.first_name?.trim())),
    last_name: name('Last name', Boolean(current.last_name?.trim()))
  })
}

export type ProfileSchema = { first_name: string, last_name: string }

// The phone number dialog: the sign-in country-code picker (AppAuthPhoneInput) and the national
// number (or a full international one); normalizePhone composes the E.164 value sent.
export const phoneNumberSchema = phoneIdentifierSchema
export type PhoneNumberSchema = { identifier: string, country: string, dialCode: string }

// Change password: the current password, then a new one under the server's default policy
// (newPasswordSchema mirrors it; a stricter host still answers INVALID_PASSWORD on the field).
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.').max(128),
    new_password: newPasswordSchema,
    confirm_password: z.string()
  })
  .refine(value => value.new_password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords must match.'
  })
  .refine(value => !value.current_password || value.new_password !== value.current_password, {
    path: ['new_password'],
    message: 'Choose a password different from your current one.'
  })

export type ChangePasswordSchema = z.output<typeof changePasswordSchema>
