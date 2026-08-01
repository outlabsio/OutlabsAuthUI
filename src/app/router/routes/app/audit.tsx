import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { AuditPage } from '@/features/audit/components/audit-page'
import { parseAuditSearch } from '@/features/audit/schemas/audit-search.schema'
import type { AuditPageSearch } from '@/features/audit/types/audit.types'
import { routes } from '@/lib/constants/routes'

export const Route = createFileRoute('/app/audit')({
  validateSearch: (search): AuditPageSearch => parseAuditSearch(search),
  component: AuditRoute,
})

function AuditRoute() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  return (
    <AuditPage
      search={search}
      onSearchChange={(next) => {
        void navigate({
          to: routes.app.audit,
          search: next,
          replace: true,
        })
      }}
    />
  )
}
