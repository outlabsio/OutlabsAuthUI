import { z } from 'zod'

function refineValidityWindow(
  values: { validFrom?: string; validUntil?: string },
  ctx: z.RefinementCtx
) {
  if (
    values.validFrom &&
    values.validUntil &&
    new Date(values.validUntil).getTime() < new Date(values.validFrom).getTime()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['validUntil'],
      message: 'Valid until must be after valid from.',
    })
  }
}

export const directRoleAssignmentSchema = z
  .object({
    roleIds: z.array(z.string()).min(1, 'Select at least one role.'),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
  })
  .superRefine(refineValidityWindow)

export type DirectRoleAssignmentFormValues = z.infer<
  typeof directRoleAssignmentSchema
>

export const editDirectRoleMembershipSchema = z
  .object({
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
  })
  .superRefine(refineValidityWindow)

export type EditDirectRoleMembershipFormValues = z.infer<
  typeof editDirectRoleMembershipSchema
>
