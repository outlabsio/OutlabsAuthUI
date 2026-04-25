import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AccessCodePage } from '@/features/auth/components/access-code-page'

const accessCodeSearchSchema = z.object({
  mode: z.enum(['request', 'verify']).optional(),
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/auth/access-code')({
  validateSearch: (search) => accessCodeSearchSchema.parse(search),
  component: AccessCodePage,
})
