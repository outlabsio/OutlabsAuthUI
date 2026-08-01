import { createFileRoute } from '@tanstack/react-router'

import { OAuthCallbackPage } from '@/features/auth/components/oauth-callback-page'

export const Route = createFileRoute('/auth/oauth/callback')({
  component: OAuthCallbackPage,
})
