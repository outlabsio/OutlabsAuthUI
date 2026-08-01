import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { MagicLinkPage } from '@/features/auth/components/magic-link-page'

const magicLinkSearchSchema = z.object({
  redirect: z.string().optional(),
  token: z.string().optional(),
})

export const Route = createFileRoute('/auth/magic-link')({
  validateSearch: (search) => magicLinkSearchSchema.parse(search),
  component: MagicLinkPage,
})
