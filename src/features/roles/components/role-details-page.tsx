import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { Button } from '@/components/ui/button'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useActorPermissions } from '@/features/auth/hooks/use-actor-permissions'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { getPermissionsQueryOptions } from '@/features/permissions/api/permissions.query-options'
import { DeleteRoleDialog } from '@/features/roles/components/delete-role-dialog'
import { RoleDetailsPanel } from '@/features/roles/components/role-details-panel'
import { RoleFormDialog } from '@/features/roles/components/role-form-dialog'
import {
  getRoleConditionGroupsQueryOptions,
  getRoleConditionsQueryOptions,
  getRoleQueryOptions,
} from '@/features/roles/api/roles.query-options'
import type { RolePermissionOption } from '@/features/roles/types/role-permission-option.types'
import { buildRolePermissionOptions } from '@/features/roles/utils/build-role-permission-options'
import { formatRoleToken } from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type RoleDetailsPageProps = {
  roleId: string
  onBack: () => void
  onDeleted: () => void
}

function resolvePermissionOptions(
  permissionCatalog: { name: string; display_name: string; description?: string | null; resource?: string | null }[] | undefined,
  fallbackPermissionNames: string[] | undefined
): RolePermissionOption[] {
  if (permissionCatalog?.length) {
    return buildRolePermissionOptions(permissionCatalog)
  }

  return buildRolePermissionOptions(
    (fallbackPermissionNames ?? []).map((permissionName) => ({
      name: permissionName,
      display_name: formatRoleToken(permissionName),
      description: null,
      resource: permissionName.split(':')[0] || 'general',
    }))
  )
}

export function RoleDetailsPage({
  roleId,
  onBack,
  onDeleted,
}: RoleDetailsPageProps) {
  const actorPermissions = useActorPermissions()
  const sessionUser = actorPermissions.sessionUser
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const roleQuery = useQuery(getRoleQueryOptions(roleId))
  const entitiesQuery = useQuery({
    ...getEntitiesQueryOptions({
      page: 1,
      limit: 400,
    }),
    retry: false,
  })
  const permissionsCatalogQuery = useQuery({
    ...getPermissionsQueryOptions({
      page: 1,
      limit: 1000,
    }),
    retry: false,
    enabled: Boolean(sessionUser?.id),
  })
  const conditionGroupsQuery = useQuery(getRoleConditionGroupsQueryOptions(roleId))
  const conditionsQuery = useQuery(getRoleConditionsQueryOptions(roleId))

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const canReadRoles = actorPermissions.has('role:read')
  const canUpdateRoles = actorPermissions.has('role:update')
  const canDeleteRoles = actorPermissions.has('role:delete')
  const abacEnabled = authConfigQuery.data?.features.abac ?? false

  const pageError =
    actorPermissions.error ??
    authConfigQuery.error ??
    roleQuery.error
  const entities = entitiesQuery.data?.items ?? []
  const permissionOptions = useMemo(
    () =>
      resolvePermissionOptions(
        permissionsCatalogQuery.data?.items,
        authConfigQuery.data?.available_permissions
      ),
    [authConfigQuery.data?.available_permissions, permissionsCatalogQuery.data?.items]
  )

  if (actorPermissions.isPending || authConfigQuery.isPending) {
    return (
      <AppLoadingState
        title="Loading role"
        description="Checking the role workspace and current session."
      />
    )
  }

  if (pageError || !canReadRoles) {
    return (
      <AppPage
        title="Role not available"
        padded
        action={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to roles
          </Button>
        }
      >
        <AppErrorState className="max-w-xl">
          {canReadRoles
            ? getApiErrorMessage(pageError, 'The selected role could not be loaded.')
            : 'Your current session cannot read the role catalog.'}
        </AppErrorState>
      </AppPage>
    )
  }

  const role = roleQuery.data

  if (!role) {
    return (
      <AppPage
        title="Loading role"
        padded
        action={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to roles
          </Button>
        }
      >
        <div className="flex min-h-[40svh] items-center justify-center text-sm text-muted-foreground">
          Loading role details…
        </div>
      </AppPage>
    )
  }

  return (
    <>
      <AppPage
        className="gap-5"
        title="Role details"
        padded
        action={
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to roles
          </Button>
        }
      >
        <RoleDetailsPanel
          role={role}
          conditions={conditionsQuery.data ?? []}
          conditionGroups={conditionGroupsQuery.data ?? []}
          isRoleLoading={roleQuery.isPending}
          conditionsLoading={conditionsQuery.isPending}
          conditionGroupsLoading={conditionGroupsQuery.isPending}
          conditionsErrorMessage={
            conditionsQuery.error
              ? getApiErrorMessage(
                  conditionsQuery.error,
                  'The role conditions could not be loaded.'
                )
              : undefined
          }
          conditionGroupsErrorMessage={
            conditionGroupsQuery.error
              ? getApiErrorMessage(
                  conditionGroupsQuery.error,
                  'The role condition groups could not be loaded.'
                )
              : undefined
          }
          abacEnabled={abacEnabled}
          canUpdateRoles={canUpdateRoles}
          canDeleteRoles={canDeleteRoles}
          onEditRole={() => setEditDialogOpen(true)}
          onDeleteRole={() => setDeleteDialogOpen(true)}
        />
      </AppPage>

      <RoleFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mode="edit"
        role={role}
        entities={entities}
        permissionOptions={permissionOptions}
        canCreateGlobalRoles={actorPermissions.isSuperuser && canUpdateRoles}
        onSuccess={() => {
          setEditDialogOpen(false)
        }}
      />

      <DeleteRoleDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        role={role}
        onDeleted={onDeleted}
      />
    </>
  )
}
