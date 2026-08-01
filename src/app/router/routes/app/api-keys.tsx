import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { redirectIfWorkspaceHidden } from '@/app/router/workspace-route-guard'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { ApiKeysPage } from '@/features/api-keys/components/api-keys-page'
import { PersonalApiKeysPage } from '@/features/api-keys/components/personal-api-keys-page'

function ApiKeysRouteComponent() {
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())

  const useSystemKeysWorkspace =
    authConfigQuery.data?.preset === 'SimpleRBAC' &&
    authConfigQuery.data.features.api_keys &&
    (authConfigQuery.data.features.system_api_keys ?? false)

  if (useSystemKeysWorkspace) {
    return <ApiKeysPage />
  }

  return <PersonalApiKeysPage />
}

export const Route = createFileRoute('/app/api-keys')({
  beforeLoad: async ({ context }) => {
    await redirectIfWorkspaceHidden(context.queryClient, 'apiKeys')
  },
  component: ApiKeysRouteComponent,
})
