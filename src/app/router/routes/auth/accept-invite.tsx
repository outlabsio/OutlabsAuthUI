import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AcceptInvitePage } from '@/features/auth/components/accept-invite-page'

const acceptInviteSearchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/auth/accept-invite')({
  validateSearch: (search) => acceptInviteSearchSchema.parse(search),
  component: AcceptInvitePage,
})
