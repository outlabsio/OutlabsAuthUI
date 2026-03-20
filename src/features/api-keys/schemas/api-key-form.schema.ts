import { z } from 'zod'

export const apiKeyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  scopesText: z.string(),
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
  entityId: z.string(),
})

export type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>
