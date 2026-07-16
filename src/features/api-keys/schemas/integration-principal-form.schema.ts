import { z } from 'zod'

export const integrationPrincipalFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  roleIds: z.array(z.string()),
  status: z.enum(['active', 'inactive']),
  inheritFromTree: z.boolean(),
})

export type IntegrationPrincipalFormValues = z.infer<typeof integrationPrincipalFormSchema>
