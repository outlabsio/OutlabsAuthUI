import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppPage } from '@/components/app/app-page'
import { AppToolbar } from '@/components/app/app-toolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { InviteUserDialog } from '@/features/users/components/invite-user-dialog'
import { UsersFilters } from '@/features/users/components/users-filters'
import { UsersTable } from '@/features/users/components/users-table'
import {
  getUserPermissionsQueryOptions,
  getUsersQueryOptions,
} from '@/features/users/api/users.query-options'
import { useResendInviteMutation } from '@/features/users/hooks/use-resend-invite-mutation'
import type { UsersPageSearch } from '@/features/users/types/users.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type UsersPageProps = {
  filters: UsersPageSearch
  onFiltersChange: (next: Omit<UsersPageSearch, 'page'>) => void
  onPageChange: (page: number) => void
  onUserSelect: (userId: string) => void
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}

export function UsersPage({
  filters,
  onFiltersChange,
  onPageChange,
  onUserSelect,
}: UsersPageProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionUser?.id ?? ''),
    enabled: Boolean(sessionUser?.id),
  })
  const usersQuery = useQuery(
    getUsersQueryOptions({
      page: filters.page,
      limit: 20,
      search: filters.search,
      status: filters.status,
      rootEntityId: filters.rootEntityId,
    })
  )
  const resendInviteMutation = useResendInviteMutation()
  const actorPermissionNames = useMemo(
    () => new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const canReadEntities =
    Boolean(sessionUser?.is_superuser) ||
    hasAnyPermission(actorPermissionNames, ['entity:read', 'entity:read_tree'])
  const entitiesQuery = useQuery({
    ...getEntitiesQueryOptions(),
    enabled: canReadEntities,
  })
  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items]
  )

  const pageError =
    sessionQuery.error ??
    actorPermissionsQuery.error ??
    usersQuery.error ??
    authConfigQuery.error ??
    entitiesQuery.error

  const authConfig = authConfigQuery.data
  const canInviteUsers =
    (authConfig?.features.invitations ?? false) &&
    (Boolean(sessionUser?.is_superuser) ||
      hasAnyPermission(actorPermissionNames, ['user:create']))
  const showStatusFilter = authConfig?.features.user_status ?? true
  const showEntityFilter = (authConfig?.features.entity_hierarchy ?? true) && canReadEntities
  const users = usersQuery.data?.items ?? []
  const invitedUsers = users.filter((user) => user.status === 'invited').length
  const adminUsers = users.filter((user) => user.is_superuser).length
  const verifiedUsers = users.filter((user) => user.email_verified).length
  const filtersKey = `${filters.search ?? ''}:${filters.status ?? ''}:${filters.rootEntityId ?? ''}`
  const shellAction = canInviteUsers ? (
    <Button type="button" className="shrink-0" onClick={() => setIsInviteDialogOpen(true)}>
      <UserPlus className="size-4" />
      Invite user
    </Button>
  ) : undefined

  return (
    <>
      <AppPage
        className="flex-1 min-h-0 gap-4 overflow-hidden"
        title="Users"
        hideTitle
        shellAction={shellAction}
        action={
          <div className="p-4">
            <div className="flex w-full flex-wrap items-center gap-2 xl:flex-nowrap">
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{usersQuery.data?.total ?? 0}</span>{' '}
                  users
                </span>
                <span>
                  <span className="font-medium text-foreground">{invitedUsers}</span> pending
                </span>
                <span>
                  <span className="font-medium text-foreground">{adminUsers}</span> admins
                </span>
                <span>
                  <span className="font-medium text-foreground">{verifiedUsers}</span> verified
                </span>
              </div>
              <AppToolbar className="min-w-0 flex-1">
                <UsersFilters
                  key={filtersKey}
                  filters={filters}
                  entityOptions={entityOptions}
                  showStatusFilter={showStatusFilter}
                  showEntityFilter={showEntityFilter}
                  onApply={onFiltersChange}
                  onReset={() => {
                    onFiltersChange({})
                  }}
                />
              </AppToolbar>
            </div>
          </div>
        }
      >
        <Card className="flex-1 min-h-0 overflow-hidden border py-0 ring-0">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {pageError ? (
              <AppErrorState className="m-4">
                {getApiErrorMessage(
                  pageError,
                  'The users management screen could not load data from the auth API.'
                )}
              </AppErrorState>
            ) : (
              <UsersTable
                users={usersQuery.data?.items ?? []}
                page={usersQuery.data?.page ?? filters.page}
                pages={usersQuery.data?.pages ?? 1}
                total={usersQuery.data?.total ?? 0}
                isLoading={usersQuery.isPending}
                isRefreshing={usersQuery.isFetching && !usersQuery.isPending}
                canResendInvites={canInviteUsers}
                resendInvitePendingUserId={resendInviteMutation.variables}
                onPageChange={onPageChange}
                onResendInvite={(userId) => {
                  void resendInviteMutation.mutateAsync(userId)
                }}
                onSelectUser={onUserSelect}
              />
            )}
          </CardContent>
        </Card>
      </AppPage>
      <InviteUserDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        entities={entitiesQuery.data?.items ?? []}
        contextAwareRoles={authConfig?.features.context_aware_roles ?? false}
      />
    </>
  )
}
