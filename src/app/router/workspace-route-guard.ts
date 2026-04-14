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
  try {
    const authConfig = await queryClient.ensureQueryData(getAuthConfigQueryOptions())

    if (!isWorkspaceVisible(workspace, authConfig.features)) {
      throw redirect({
        to: routes.app.dashboard,
      })
    }
  } catch (error) {
    if (error instanceof Error) {
      return
    }

    throw error
  }
}
