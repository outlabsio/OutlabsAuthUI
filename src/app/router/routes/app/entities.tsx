import { Outlet, createFileRoute } from '@tanstack/react-router'

import { parseEntitiesSearch } from '@/features/entities/schemas/entities-search.schema'
import type { EntitiesPageSearch } from '@/features/entities/types/entities.types'

export const Route = createFileRoute('/app/entities')({
  validateSearch: (search): EntitiesPageSearch => parseEntitiesSearch(search),
  component: Outlet,
})
