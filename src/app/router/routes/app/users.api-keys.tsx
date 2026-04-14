import { createFileRoute } from '@tanstack/react-router'

import { redirectIfWorkspaceHidden } from '@/app/router/workspace-route-guard'
import { ApiKeysPage } from '@/features/api-keys/components/api-keys-page'

export const Route = createFileRoute('/app/users/api-keys')({
  beforeLoad: async ({ context }) => {
    await redirectIfWorkspaceHidden(context.queryClient, 'systemApiKeys')
  },
  component: ApiKeysPage,
})
