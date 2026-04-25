import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { routes } from '@/lib/constants/routes'
import {
  isWorkspaceVisible,
  type WorkspaceKey,
} from '@/lib/workspace-visibility'

export async function redirectIfWorkspaceHidden(
  queryClient: QueryClient,
  workspace: WorkspaceKey
) {
  const authConfig = await queryClient.ensureQueryData(getAuthConfigQueryOptions())

  if (!isWorkspaceVisible(workspace, authConfig.features)) {
    throw redirect({
      to: routes.app.dashboard,
    })
  }
}
