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

const membershipLifecycleObjectSchema = z.object({
  status: z.enum(['active', 'suspended']),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  reason: z
    .string()
    .trim()
    .max(500, 'Reason must be 500 characters or fewer.')
    .optional(),
})

export const membershipLifecycleFieldsSchema =
  membershipLifecycleObjectSchema.superRefine(refineValidityWindow)

export const membershipAccessFormSchema = membershipLifecycleObjectSchema
  .extend({
    entityId: z.string().trim().min(1, 'Select an entity.'),
    roleIds: z.array(z.string()),
  })
  .superRefine(refineValidityWindow)

export type MembershipLifecycleFormValues = z.infer<
  typeof membershipLifecycleFieldsSchema
>
export type MembershipAccessFormValues = z.infer<
  typeof membershipAccessFormSchema
>
