import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { ShieldPlus } from 'lucide-react'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { Button } from '@/components/ui/button'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { RoleFormDialog } from '@/features/roles/components/role-form-dialog'
import { getPermissionsQueryOptions } from '@/features/permissions/api/permissions.query-options'
import { RolesFiltersBar } from '@/features/roles/components/roles-filters-bar'
import { RolesTable } from '@/features/roles/components/roles-table'
import { getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import type { RolesPageSearch } from '@/features/roles/types/roles.types'
import {
  formatRoleToken,
  matchesRolesSearchFilters,
  sortRolesForCatalog,
} from '@/features/roles/utils/role-display'
import { buildRolePermissionOptions } from '@/features/roles/utils/build-role-permission-options'
import { getUserPermissionsQueryOptions } from '@/features/users/api/users.query-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type RolesPageProps = {
  search: RolesPageSearch
  onSearchChange: (next: RolesPageSearch) => void
  onRoleSelect: (roleId: string) => void
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}

export function RolesPage({
  search,
  onSearchChange,
  onRoleSelect,
}: RolesPageProps) {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionUser?.id ?? ''),
    enabled: Boolean(sessionUser?.id),
  })
  const rolesQuery = useQuery(
    getRolesQueryOptions({
      page: 1,
      limit: 100,
      search: search.search,
      rootEntityId: search.scopeRootId,
    })
  )
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

  const actorPermissionNames = useMemo(
    () => new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const isSuperuser = Boolean(sessionUser?.is_superuser)
  const canReadRoles = hasAnyPermission(actorPermissionNames, ['role:read'])
  const canCreateRoles = hasAnyPermission(actorPermissionNames, ['role:create'])

  const pageError =
    sessionQuery.error ??
    actorPermissionsQuery.error ??
    authConfigQuery.error ??
    rolesQuery.error
  const entities = entitiesQuery.data?.items ?? []
  const rootOptions = useMemo(() => {
    const rootsById = new Map<string, { id: string; display_name: string }>()

    entities
      .filter((entity) => entity.parent_entity_id == null)
      .forEach((entity) => {
        rootsById.set(entity.id, {
          id: entity.id,
          display_name: entity.display_name,
        })
      })

    ;(rolesQuery.data?.items ?? []).forEach((role) => {
      if (role.root_entity_id && role.root_entity_name) {
        rootsById.set(role.root_entity_id, {
          id: role.root_entity_id,
          display_name: role.root_entity_name,
        })
      }
    })

    return [...rootsById.values()].sort((left, right) =>
      left.display_name.localeCompare(right.display_name)
    )
  }, [entities, rolesQuery.data?.items])
  const entityTypes = useMemo(() => {
    const entityTypeValues = new Set<string>()

    entities.forEach((entity) => {
      entityTypeValues.add(entity.entity_type)
    })

    ;(rolesQuery.data?.items ?? []).forEach((role) => {
      role.assignable_at_types.forEach((assignableType) => {
        entityTypeValues.add(assignableType)
      })
    })

    return [...entityTypeValues].sort((left, right) => left.localeCompare(right))
  }, [entities, rolesQuery.data?.items])

  const filteredRoles = useMemo(
    () =>
      sortRolesForCatalog(
        (rolesQuery.data?.items ?? []).filter((role) => matchesRolesSearchFilters(role, search))
      ),
    [rolesQuery.data?.items, search]
  )

  const permissionOptions = useMemo(() => {
    if (permissionsCatalogQuery.data?.items?.length) {
      return buildRolePermissionOptions(permissionsCatalogQuery.data.items)
    }

    const fallbackPermissionNames = authConfigQuery.data?.available_permissions ?? []
      return buildRolePermissionOptions(
        fallbackPermissionNames.map((permissionName) => ({
          name: permissionName,
          display_name: formatRoleToken(permissionName),
        description: null,
        resource: permissionName.split(':')[0] || 'general',
      }))
    )
  }, [authConfigQuery.data?.available_permissions, permissionsCatalogQuery.data?.items])

  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  if (sessionQuery.isPending || actorPermissionsQuery.isPending || authConfigQuery.isPending) {
    return <AppLoadingState title="Loading roles workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="Roles" hideTitle>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          {getApiErrorMessage(
            pageError,
            'The roles workspace could not load data from the auth API.'
          )}
        </div>
      </AppPage>
    )
  }

  return (
    <>
      <AppPage
        title="Roles"
        hideTitle
        shellAction={
          canCreateRoles ? (
            <Button
              type="button"
              className="shrink-0"
              onClick={() => setCreateDialogOpen(true)}
            >
              <ShieldPlus className="size-4" />
              Create role
            </Button>
          ) : undefined
        }
      >
        {!canReadRoles ? (
          <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            Your current session cannot read the role catalog.
          </div>
        ) : (
          <div className="space-y-4">
            <RolesFiltersBar
              search={search}
              rootOptions={rootOptions}
              entityTypes={entityTypes}
              stats={{
                total: filteredRoles.length,
                global: filteredRoles.filter((role) => role.is_global && !role.scope_entity_id).length,
                root: filteredRoles.filter((role) => !role.is_global && !role.scope_entity_id).length,
                entity: filteredRoles.filter((role) => Boolean(role.scope_entity_id)).length,
                auto: filteredRoles.filter((role) => role.is_auto_assigned).length,
                system: filteredRoles.filter((role) => role.is_system_role).length,
              }}
              onApply={onSearchChange}
              onReset={() => onSearchChange({})}
            />

            <RolesTable
              roles={filteredRoles}
              isLoading={rolesQuery.isPending}
              isRefreshing={rolesQuery.isFetching && !rolesQuery.isPending}
              onRoleSelect={(roleId) => onRoleSelect(roleId)}
            />
          </div>
        )}
      </AppPage>

      <RoleFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        mode="create"
        entities={entities}
        permissionOptions={permissionOptions}
        canCreateGlobalRoles={isSuperuser && canCreateRoles}
        onSuccess={(role) => {
          onRoleSelect(role.id)
        }}
      />
    </>
  )
}
