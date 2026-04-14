import { Outlet, createFileRoute } from '@tanstack/react-router'

import { redirectIfWorkspaceHidden } from '@/app/router/workspace-route-guard'
import { parseEntitiesSearch } from '@/features/entities/schemas/entities-search.schema'
import type { EntitiesPageSearch } from '@/features/entities/types/entities.types'

export const Route = createFileRoute('/app/entities')({
  beforeLoad: async ({ context }) => {
    await redirectIfWorkspaceHidden(context.queryClient, 'entities')
  },
  validateSearch: (search): EntitiesPageSearch => parseEntitiesSearch(search),
  component: Outlet,
})
