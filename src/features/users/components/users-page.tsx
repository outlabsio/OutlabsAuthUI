import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'

import { AppPage } from '@/components/app/app-page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import { InviteUserDialog } from '@/features/users/components/invite-user-dialog'
import { UsersFilters } from '@/features/users/components/users-filters'
import { UsersTable } from '@/features/users/components/users-table'
import { getUsersQueryOptions } from '@/features/users/api/users.query-options'
import { useResendInviteMutation } from '@/features/users/hooks/use-resend-invite-mutation'
import type { UsersPageSearch } from '@/features/users/types/users.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type UsersPageProps = {
  filters: UsersPageSearch
  onFiltersChange: (next: Omit<UsersPageSearch, 'page'>) => void
  onPageChange: (page: number) => void
  onUserSelect: (userId: string) => void
}

export function UsersPage({
  filters,
  onFiltersChange,
  onPageChange,
  onUserSelect,
}: UsersPageProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const entitiesQuery = useQuery(getEntitiesQueryOptions())
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

  const entityOptions = useMemo(
    () => buildEntityOptions(entitiesQuery.data?.items ?? []),
    [entitiesQuery.data?.items]
  )

  const pageError =
    usersQuery.error ??
    authConfigQuery.error ??
    entitiesQuery.error ??
    resendInviteMutation.error

  const authConfig = authConfigQuery.data
  const canInviteUsers = authConfig?.features.invitations ?? false
  const showStatusFilter = authConfig?.features.user_status ?? true
  const showEntityFilter = authConfig?.features.entity_hierarchy ?? true
  const users = usersQuery.data?.items ?? []
  const invitedUsers = users.filter((user) => user.status === 'invited').length
  const adminUsers = users.filter((user) => user.is_superuser).length
  const verifiedUsers = users.filter((user) => user.email_verified).length
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
            <div className="min-w-0 flex-1 rounded-xl border bg-card/70 px-3 py-2.5">
              <UsersFilters
                filters={filters}
                entityOptions={entityOptions}
                showStatusFilter={showStatusFilter}
                showEntityFilter={showEntityFilter}
                onApply={onFiltersChange}
                onReset={() => {
                  onFiltersChange({})
                }}
              />
            </div>
          </div>
        }
      >
        <Card className="flex-1 min-h-0 overflow-hidden border ring-0">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {pageError ? (
              <div className="m-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                {getApiErrorMessage(
                  pageError,
                  'The users management screen could not load data from the auth API.'
                )}
              </div>
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
