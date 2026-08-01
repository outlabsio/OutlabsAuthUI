import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ResetPasswordPage } from '@/features/auth/components/reset-password-page'

const resetPasswordSearchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/auth/reset-password')({
  validateSearch: (search) => resetPasswordSearchSchema.parse(search),
  component: ResetPasswordPage,
})
