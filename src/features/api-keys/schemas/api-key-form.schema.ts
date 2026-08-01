import { z } from 'zod'

export const apiKeyRateLimitPerMinuteSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed === '' ? undefined : Number(trimmed)
    }

    return value
  },
  z
    .number({ error: 'Rate limit is required.' })
    .int('Enter a whole number.')
    .min(0, 'Use 0 for unlimited or enter at least 1 request per minute.')
    .max(100000, 'Rate limit is too high.')
)

export const apiKeyFormSchema = z.object({
  entityId: z.string().trim(),
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  scopes: z.array(z.string().trim().min(1)).min(1, 'Select at least one scope.'),
  ipWhitelistText: z.string(),
  prefixType: z.string().trim().min(1, 'Prefix type is required.'),
  rateLimitPerMinute: apiKeyRateLimitPerMinuteSchema,
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
