import { z } from 'zod'

import { apiKeyRateLimitPerMinuteSchema } from '@/features/api-keys/schemas/api-key-form.schema'

export const systemIntegrationApiKeyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  accessMode: z.enum(['full', 'restricted']),
  selectedScopes: z.array(z.string()),
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
})

export type SystemIntegrationApiKeyFormValues = z.infer<
  typeof systemIntegrationApiKeyFormSchema
>
export type SystemIntegrationApiKeyFormInput = z.input<
  typeof systemIntegrationApiKeyFormSchema
>
