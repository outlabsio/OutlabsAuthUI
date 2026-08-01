import { createFileRoute } from '@tanstack/react-router'

import { redirectIfWorkspaceHidden } from '@/app/router/workspace-route-guard'
import { SettingsPage } from '@/features/settings/components/settings-page'

export const Route = createFileRoute('/app/settings')({
  beforeLoad: async ({ context }) => {
    await redirectIfWorkspaceHidden(context.queryClient, 'settings')
  },
  component: SettingsPage,
})
