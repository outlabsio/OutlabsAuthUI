import { z } from 'zod'
import { dateInput, emailText, optionalText, reasonText, requiredText } from '~/schemas/common'
import { newPasswordSchema } from '~/schemas/auth-flows'
import { NO_ROOT_ORG } from '~/utils/users'

// The users area's dialog forms (AppFormDialog + UForm :schema). confirm_password is validated
// (must match) but never sent. The organization and the invite entity are part of the form, so
// "required" reads on the field like every other rule; the `*SchemaFor` builders take the
// actor-dependent rules (newUserRootChoice / inviteEntityRule in utils/users.ts).

const nameField = optionalText(120)

export type CreateUserRules = {
  // A delegated admin must place the account in their organization (F-012).
  rootRequired: boolean
}

export function createUserSchemaFor(rules: CreateUserRules) {
  return z
    .object({
      email: emailText,
      password: newPasswordSchema,
      confirm_password: z.string(),
      first_name: nameField,
      last_name: nameField,
      root_entity_id: z.string(),
      is_superuser: z.boolean()
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirm_password) {
        ctx.addIssue({ code: 'custom', path: ['confirm_password'], message: 'Passwords do not match.' })
      }
      if (rules.rootRequired && (!data.root_entity_id || data.root_entity_id === NO_ROOT_ORG)) {
        ctx.addIssue({ code: 'custom', path: ['root_entity_id'], message: 'Choose the organization the account belongs to.' })
      }
    })
}

export const createUserSchema = createUserSchemaFor({ rootRequired: false })
export type CreateUserSchema = z.output<typeof createUserSchema>

export type InviteUserRules = {
  // A delegated admin's invite must create a membership they can see the account through.
  entityRequired: boolean
}

export function inviteUserSchemaFor(rules: InviteUserRules) {
  return z
    .object({
      email: emailText,
      first_name: nameField,
      last_name: nameField,
      // AppEntityPicker clears to undefined.
      entity_id: z.string().optional(),
      role_ids: z.array(z.string()),
      is_superuser: z.boolean()
    })
    .superRefine((data, ctx) => {
      if (rules.entityRequired && !data.entity_id) {
        ctx.addIssue({ code: 'custom', path: ['entity_id'], message: 'Choose the entity the account joins.' })
      }
    })
}

export const inviteUserSchema = inviteUserSchemaFor({ entityRequired: false })
export type InviteUserSchema = z.output<typeof inviteUserSchema>

// Admin password reset — new password + confirmation (confirm isn't sent, just validated). The
// same rules as every other new password in the console (newPasswordSchema); the server's own
// policy answer lands on the field when it is stricter.
export const resetPasswordSchema = z
  .object({
    new_password: newPasswordSchema,
    confirm_password: z.string()
  })
  .refine(data => data.new_password === data.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password']
  })

export type ResetPasswordSchema = z.output<typeof resetPasswordSchema>

// Change status (F-062, F-208). `suspendedUntil` is a day ('' = until reactivated) and matters
// only for a suspension. A new end day may not be in the past; the stored day may stay as it is
// (an admin adding a reason to an overdue suspension).
export function userStatusSchemaFor(rules: { storedDay: string, today: string }) {
  return z
    .object({
      status: z.enum(['active', 'suspended', 'banned']),
      suspendedUntil: dateInput,
      reason: reasonText
    })
    .superRefine((data, ctx) => {
      const day = data.suspendedUntil
      if (data.status === 'suspended' && day && day !== rules.storedDay && day < rules.today) {
        ctx.addIssue({ code: 'custom', path: ['suspendedUntil'], message: 'Choose today or a later day.' })
      }
    })
}

export type UserStatusSchema = z.output<ReturnType<typeof userStatusSchemaFor>>

// Grant or revoke superuser (F-175): granting needs a reason for the audit log and the account's
// email typed back; revoking takes an optional reason.
export function superuserChangeSchemaFor(rules: { granting: boolean, email: string }) {
  return z.object({
    reason: rules.granting ? requiredText('A reason', 500) : reasonText,
    confirmation: rules.granting
      ? z.string().refine(value => value.trim() === rules.email, `Type ${rules.email} exactly to confirm.`)
      : z.string()
  })
}

export type SuperuserChangeSchema = z.output<ReturnType<typeof superuserChangeSchemaFor>>

// Admin profile edit (PATCH /users/{id}). Changing the email changes the sign-in identifier and
// marks the address unverified (F-064).
export const updateUserSchema = z.object({
  email: emailText,
  first_name: nameField,
  last_name: nameField,
  phone: z
    .string()
    .trim()
    .refine(
      value => value === '' || /^\+[1-9]\d{6,14}$/.test(value),
      'Phone must be E.164 format (e.g. +15551234567), or left blank.'
    )
})

export type UpdateUserSchema = z.output<typeof updateUserSchema>
