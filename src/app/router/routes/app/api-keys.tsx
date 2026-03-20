import { createFileRoute } from '@tanstack/react-router'

import { ApiKeysPage } from '@/features/api-keys/components/api-keys-page'

export const Route = createFileRoute('/app/api-keys')({
  component: ApiKeysPage,
})
