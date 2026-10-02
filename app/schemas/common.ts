import { z } from 'zod'
import { INCOMPLETE_DAY, INCOMPLETE_DAY_MESSAGE, isDateInput, validityWindowError } from '~/utils/validity'

// Shared Zod pieces for dialog forms (UForm :schema). Build each form's schema from these so the
// same kind of field validates, and reads, the same way everywhere:
//
//   const schema = z.object({
//     display_name: requiredText('Display name'),
//     description: optionalText(500),
//     validFrom: dateInput,
//     validUntil: dateInput,
//     reason: reasonText
//   }).superRefine(checkValidityWindow)
//
// Messages are full sentences; the field's label already says which field it is.

/** A required, trimmed string: `<label> is required.` when blank. */
export function requiredText(label: string, max = 255) {
  return z.string().trim().min(1, `${label} is required.`).max(max, `Use at most ${max} characters.`)
}

/** An optional, trimmed string ('' allowed). */
export function optionalText(max = 500) {
  return z.string().trim().max(max, `Use at most ${max} characters.`)
}

/** A name a new account may be given (first or last): optional, at most the API's 100 characters. */
export const newAccountNameText = optionalText(100)

/**
 * A first or last name of an existing account. outlabs-auth accepts at most 100 characters and
 * never clears a name once it is set (validate_name rejects an empty value), so a name the account
 * already has is required, and a name it does not have stays optional (the edit forms send
 * changed fields only, so it is sent only when typed). `requiredMessage` says that it can be
 * changed but not removed, in the form's own voice.
 */
export function accountNameText(label: string, isSet: boolean, requiredMessage: string) {
  const base = z.string().trim().max(100, `${label} must be 100 characters or fewer.`)
  return isSet ? base.min(1, requiredMessage) : base
}

/** An email address (trimmed). */
export const emailText = z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.')

/** The optional audit note most lifecycle writes accept (the API caps it at 500 characters). */
export const reasonText = optionalText(500)

/**
 * A calendar day from AppDateField: 'YYYY-MM-DD', or '' when not set. A partly typed date
 * (INCOMPLETE_DAY) is rejected with its own message instead of passing as "not set".
 */
export const dateInput = z
  .string()
  .refine(value => value !== INCOMPLETE_DAY, INCOMPLETE_DAY_MESSAGE)
  .refine(value => value === '' || value === INCOMPLETE_DAY || isDateInput(value), 'Enter a valid date.')

/** A list of trimmed, non-empty, unique strings (UInputTags). */
export const tagList = z
  .array(z.string().trim().min(1, 'Remove the empty value.'))
  .refine(values => new Set(values).size === values.length, 'Remove the duplicate values.')

/**
 * superRefine for forms with `validFrom` / `validUntil` day fields: "until" may not be before
 * "from". The issue lands on `validUntil`.
 */
export function checkValidityWindow(data: { validFrom?: string, validUntil?: string }, ctx: z.RefinementCtx) {
  const message = validityWindowError(data.validFrom ?? '', data.validUntil ?? '')
  if (message) ctx.addIssue({ code: 'custom', path: ['validUntil'], message })
}

/** The two validity-window fields, to spread into a form's z.object shape. */
export const validityWindowShape = {
  validFrom: dateInput,
  validUntil: dateInput
}
