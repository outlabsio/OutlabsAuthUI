import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { Button } from '@/components/ui/button'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import {
  getPermissionConditionGroupsQueryOptions,
  getPermissionConditionsQueryOptions,
  getPermissionQueryOptions,
  getPermissionsQueryOptions,
} from '@/features/permissions/api/permissions.query-options'
import { DeletePermissionDialog } from '@/features/permissions/components/delete-permission-dialog'
import { PermissionDetailsPanel } from '@/features/permissions/components/permission-details-panel'
import { PermissionFormDialog } from '@/features/permissions/components/permission-form-dialog'
import { PermissionsCatalogPanel } from '@/features/permissions/components/permissions-catalog-panel'
import { PermissionsFilterRail } from '@/features/permissions/components/permissions-filter-rail'
import type { Permission, PermissionsPageSearch } from '@/features/permissions/types/permissions.types'
import {
  groupPermissionsByResource,
  matchesPermissionsSearchFilters,
  sortPermissionsForCatalog,
} from '@/features/permissions/utils/permissions-display'
import { getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import { getUserPermissionsQueryOptions } from '@/features/users/api/users.query-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type PermissionsPageProps = {
  selectedPermissionId?: string
  search: PermissionsPageSearch
  onSearchChange: (next: PermissionsPageSearch) => void
  onPermissionSelect: (permissionId?: string) => void
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}

export function PermissionsPage({
  selectedPermissionId,
  search,
  onSearchChange,
  onPermissionSelect,
}: PermissionsPageProps) {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionUser?.id ?? ''),
    enabled: Boolean(sessionUser?.id),
  })
  const permissionsQuery = useQuery(
    getPermissionsQueryOptions({
      page: 1,
      limit: 1000,
      resource: search.resource,
    })
  )
  const permissionDetailQuery = useQuery({
    ...getPermissionQueryOptions(selectedPermissionId ?? ''),
    enabled: Boolean(selectedPermissionId),
  })
  const conditionGroupsQuery = useQuery({
    ...getPermissionConditionGroupsQueryOptions(selectedPermissionId ?? ''),
    enabled: Boolean(selectedPermissionId),
  })
  const conditionsQuery = useQuery({
    ...getPermissionConditionsQueryOptions(selectedPermissionId ?? ''),
    enabled: Boolean(selectedPermissionId),
  })

  const actorPermissionNames = useMemo(
    () => new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const isSuperuser = Boolean(sessionUser?.is_superuser)
  const canReadPermissions =
    isSuperuser || hasAnyPermission(actorPermissionNames, ['permission:read'])
  const canCreatePermissions =
    isSuperuser || hasAnyPermission(actorPermissionNames, ['permission:create'])
  const canUpdatePermissions =
    isSuperuser || hasAnyPermission(actorPermissionNames, ['permission:update'])
  const canDeletePermissions =
    isSuperuser || hasAnyPermission(actorPermissionNames, ['permission:delete'])
  const canReadRoles = isSuperuser || hasAnyPermission(actorPermissionNames, ['role:read'])
  const abacEnabled = authConfigQuery.data?.features.abac ?? false

  const rolesQuery = useQuery({
    ...getRolesQueryOptions({
      page: 1,
      limit: 100,
    }),
    enabled: canReadRoles,
  })

  const pageError =
    sessionQuery.error ??
    actorPermissionsQuery.error ??
    authConfigQuery.error ??
    permissionsQuery.error
  const permissionDetailErrorMessage = permissionDetailQuery.error
    ? getApiErrorMessage(
        permissionDetailQuery.error,
        'The selected permission could not be loaded.'
      )
    : null

  const filteredPermissions = useMemo(
    () =>
      sortPermissionsForCatalog(
        (permissionsQuery.data?.items ?? []).filter((permission) =>
          matchesPermissionsSearchFilters(permission, search)
        )
      ),
    [permissionsQuery.data?.items, search]
  )
  const resources = useMemo(
    () =>
      [...new Set((permissionsQuery.data?.items ?? []).map((permission) => permission.resource).filter(Boolean))]
        .map((resource) => String(resource))
        .sort((left, right) => left.localeCompare(right)),
    [permissionsQuery.data?.items]
  )
  const tags = useMemo(
    () =>
      [...new Set((permissionsQuery.data?.items ?? []).flatMap((permission) => permission.tags))]
        .sort((left, right) => left.localeCompare(right)),
    [permissionsQuery.data?.items]
  )
  const permissionGroups = useMemo(
    () => groupPermissionsByResource(filteredPermissions),
    [filteredPermissions]
  )
  const visiblePermission = useMemo(() => {
    if (!selectedPermissionId) {
      return null
    }

    return filteredPermissions.find((permission) => permission.id === selectedPermissionId) ?? null
  }, [filteredPermissions, selectedPermissionId])
  const activePermission = permissionDetailQuery.data ?? visiblePermission
  const linkedRoles = useMemo(() => {
    if (!activePermission) {
      return []
    }

    return (rolesQuery.data?.items ?? []).filter((role) =>
      role.permissions.includes(activePermission.name)
    )
  }, [activePermission, rolesQuery.data?.items])

  const [permissionDialogState, setPermissionDialogState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    permission: Permission | null
  }>({
    open: false,
    mode: 'create',
    permission: null,
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  if (sessionQuery.isPending || actorPermissionsQuery.isPending || authConfigQuery.isPending) {
    return <AppLoadingState title="Loading permissions workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="Permissions">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          {getApiErrorMessage(
            pageError,
            'The permissions workspace could not load data from the auth API.'
          )}
        </div>
      </AppPage>
    )
  }

  return (
    <>
      <AppPage
        title="Permissions"
        action={
          <div className="flex w-full flex-wrap items-center gap-2 xl:flex-nowrap">
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{filteredPermissions.length}</span> visible
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {filteredPermissions.filter((permission) => !permission.is_system).length}
                </span>{' '}
                custom
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {filteredPermissions.filter((permission) => permission.is_system).length}
                </span>{' '}
                system
              </span>
            </div>
            {canCreatePermissions ? (
              <Button
                type="button"
                className="shrink-0"
                onClick={() =>
                  setPermissionDialogState({
                    open: true,
                    mode: 'create',
                    permission: null,
                  })
                }
              >
                <KeyRound className="size-4" />
                Create permission
              </Button>
            ) : null}
          </div>
        }
      >
        {!canReadPermissions ? (
          <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            Your current session cannot read the permission catalog.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,0.95fr)_minmax(0,1.1fr)]">
            <PermissionsFilterRail
              search={search}
              resources={resources}
              tags={tags}
              stats={{
                total: filteredPermissions.length,
                system: filteredPermissions.filter((permission) => permission.is_system).length,
                custom: filteredPermissions.filter((permission) => !permission.is_system).length,
                active: filteredPermissions.filter((permission) => permission.is_active).length,
              }}
              onSearchChange={onSearchChange}
            />

            <PermissionsCatalogPanel
              permissionGroups={permissionGroups}
              selectedPermissionId={selectedPermissionId}
              isLoading={permissionsQuery.isPending}
              isRefreshing={permissionsQuery.isFetching && !permissionsQuery.isPending}
              errorMessage={undefined}
              onPermissionSelect={onPermissionSelect}
            />

            <div className="space-y-4">
              {permissionDetailErrorMessage ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                  {permissionDetailErrorMessage}
                </div>
              ) : null}

              <PermissionDetailsPanel
                permission={activePermission}
                linkedRoles={linkedRoles}
                canReadRoles={canReadRoles}
                conditionGroups={conditionGroupsQuery.data ?? []}
                conditions={conditionsQuery.data ?? []}
                conditionGroupsLoading={conditionGroupsQuery.isPending}
                conditionsLoading={conditionsQuery.isPending}
                conditionGroupsErrorMessage={
                  conditionGroupsQuery.error
                    ? getApiErrorMessage(
                        conditionGroupsQuery.error,
                        'The permission condition groups could not be loaded.'
                      )
                    : undefined
                }
                conditionsErrorMessage={
                  conditionsQuery.error
                    ? getApiErrorMessage(
                        conditionsQuery.error,
                        'The permission conditions could not be loaded.'
                      )
                    : undefined
                }
                abacEnabled={abacEnabled}
                canUpdatePermissions={canUpdatePermissions}
                canDeletePermissions={canDeletePermissions}
                onEditPermission={() => {
                  if (!activePermission) {
                    return
                  }

                  setPermissionDialogState({
                    open: true,
                    mode: 'edit',
                    permission: activePermission,
                  })
                }}
                onDeletePermission={() => {
                  if (!activePermission) {
                    return
                  }

                  setDeleteDialogOpen(true)
                }}
              />
            </div>
          </div>
        )}
      </AppPage>

      <PermissionFormDialog
        open={permissionDialogState.open}
        onOpenChange={(nextOpen) =>
          setPermissionDialogState((currentState) => ({
            ...currentState,
            open: nextOpen,
          }))
        }
        mode={permissionDialogState.mode}
        permission={permissionDialogState.permission}
        canCreateSystemPermissions={isSuperuser && canCreatePermissions}
        onSuccess={(permission) => {
          onPermissionSelect(permission.id)
        }}
      />

      <DeletePermissionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        permission={activePermission}
        linkedRolesCount={linkedRoles.length}
        onDeleted={() => {
          onPermissionSelect(undefined)
        }}
      />
    </>
  )
}
