import { z } from 'zod'
import { checkValidityWindow, dateInput, reasonText, validityWindowShape } from '~/schemas/common'
import { isDateInput } from '~/utils/validity'

// Membership and direct-role-assignment dialogs. Only 'active' and 'suspended' are set directly;
// revoking is its own action (Remove) and an ended grant comes back through Reactivate. The
// validity window is two calendar days in the admin's time zone (utils/validity.ts), "until" not
// before "from".
export const membershipStatusField = z.enum(['active', 'suspended'])

// Edit a direct role assignment: status + validity window (the role itself is not editable).
export const roleAssignmentEditSchema = z
  .object({
    status: membershipStatusField,
    ...validityWindowShape
  })
  .superRefine(checkValidityWindow)

export type RoleAssignmentEditSchema = z.output<typeof roleAssignmentEditSchema>

// Assign direct roles (user detail): one or more roles, an optional window.
export const assignRolesSchema = z
  .object({
    roleIds: z.array(z.string()).min(1, 'Choose at least one role.'),
    ...validityWindowShape
  })
  .superRefine(checkValidityWindow)

export type AssignRolesSchema = z.output<typeof assignRolesSchema>

// Add a membership from the user's page: the entity, then roles, status, window and a note.
export const addMembershipSchema = z
  .object({
    entityId: z.string().min(1, 'Choose an entity.'),
    roleIds: z.array(z.string()),
    status: membershipStatusField,
    ...validityWindowShape,
    reason: reasonText
  })
  .superRefine(checkValidityWindow)

export type AddMembershipSchema = z.output<typeof addMembershipSchema>

// Edit a live membership's access (user detail and entity Users card): roles, status, window
// and a note. The entity and the user are fixed.
export const editMembershipSchema = z
  .object({
    roleIds: z.array(z.string()),
    status: membershipStatusField,
    ...validityWindowShape,
    reason: reasonText
  })
  .superRefine(checkValidityWindow)

export type EditMembershipSchema = z.output<typeof editMembershipSchema>

// Reactivate an ended or suspended grant (AppAccessReactivateDialog): an optional new end day,
// never in the past, and, for memberships, a note. `today` is the admin's day when the dialog
// opened.
export function reactivateGrantSchemaFor(rules: { today: string }) {
  return z
    .object({
      validUntil: dateInput,
      reason: reasonText
    })
    .superRefine((data, ctx) => {
      if (isDateInput(data.validUntil) && data.validUntil < rules.today) {
        ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Choose today or a later day, or clear it.' })
      }
    })
}

export type ReactivateGrantSchema = z.output<ReturnType<typeof reactivateGrantSchemaFor>>

// Check access (AppUserCheckAccessDialog): permission names, optionally inside one entity.
export const checkAccessSchema = z.object({
  permissions: z.array(z.string().trim().min(1)).min(1, 'Choose at least one permission.'),
  entityId: z.string()
})

export type CheckAccessSchema = z.output<typeof checkAccessSchema>
