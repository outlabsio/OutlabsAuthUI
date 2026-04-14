import { createFileRoute } from '@tanstack/react-router'

import { PersonalApiKeysPage } from '@/features/api-keys/components/personal-api-keys-page'

export const Route = createFileRoute('/app/api-keys')({
  component: PersonalApiKeysPage,
})
