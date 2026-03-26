import { z } from 'zod'

export const apiKeyFormSchema = z.object({
  ownerId: z.string().trim().min(1, 'Owner is required.'),
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  scopes: z.array(z.string().trim().min(1)).min(1, 'Select at least one scope.'),
  ipWhitelistText: z.string(),
  prefixType: z.string().trim().min(1, 'Prefix type is required.'),
  rateLimitPerMinute: z.coerce
    .number()
    .int('Enter a whole number.')
    .min(1, 'Rate limit must be at least 1.')
    .max(100000, 'Rate limit is too high.'),
  expiresInDays: z.union([
    z.literal(''),
    z.coerce
      .number()
      .int('Enter a whole number of days.')
      .min(1, 'Expiration must be at least 1 day.')
      .max(3650, 'Expiration is too far in the future.'),
  ]),
  status: z.enum(['active', 'suspended']),
  inheritFromTree: z.boolean(),
})

export type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>
