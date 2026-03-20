import { createFileRoute } from '@tanstack/react-router'

import { AccountPage } from '@/features/account/components/account-page'

export const Route = createFileRoute('/app/account')({
  component: AccountPage,
})
