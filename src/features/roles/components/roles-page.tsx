import { useMemo, useState } from 'react'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ShieldPlus } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppToolbar } from '@/components/app/app-toolbar'
import { Button } from '@/components/ui/button'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import { RoleFormDialog } from '@/features/roles/components/role-form-dialog'
import { getPermissionsQueryOptions } from '@/features/permissions/api/permissions.query-options'
import { RolesFiltersBar } from '@/features/roles/components/roles-filters-bar'
import { RolesTable } from '@/features/roles/components/roles-table'
import { getInfiniteRolesQueryOptions } from '@/features/roles/api/roles.query-options'
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
  const rolesQuery = useInfiniteQuery(
    getInfiniteRolesQueryOptions({
      limit: 40,
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
  const hasActorPermission = (candidates: string[]) =>
    isSuperuser || hasAnyPermission(actorPermissionNames, candidates)
  const canReadRoles = hasActorPermission(['role:read'])
  const canCreateRoles = hasActorPermission(['role:create'])

  const pageError =
    sessionQuery.error ??
    actorPermissionsQuery.error ??
    authConfigQuery.error ??
    rolesQuery.error
  const allRoles = useMemo(
    () => rolesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [rolesQuery.data?.pages]
  )
  const entities = useMemo(
    () => entitiesQuery.data?.items ?? [],
    [entitiesQuery.data?.items]
  )
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

    allRoles.forEach((role) => {
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
  }, [allRoles, entities])
  const entityTypes = useMemo(() => {
    const entityTypeValues = new Set<string>()

    entities.forEach((entity) => {
      entityTypeValues.add(entity.entity_type)
    })

    allRoles.forEach((role) => {
      role.assignable_at_types.forEach((assignableType) => {
        entityTypeValues.add(assignableType)
      })
    })

    return [...entityTypeValues].sort((left, right) => left.localeCompare(right))
  }, [allRoles, entities])

  const filteredRoles = useMemo(
    () =>
      sortRolesForCatalog(
        allRoles.filter((role) => matchesRolesSearchFilters(role, search))
      ),
    [allRoles, search]
  )

  const permissionOptions = (() => {
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
  })()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const searchKey = [
    search.search ?? '',
    search.roleType ?? '',
    search.scopeMode ?? '',
    search.scopeRootId ?? '',
    search.assignableType ?? '',
    search.usage ?? '',
    search.system ?? '',
  ].join(':')
  const rolesSummary = (
    <div className="hidden min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground xl:flex">
      <span>
        <span className="font-medium text-foreground">{filteredRoles.length}</span> roles
      </span>
      <span>
        <span className="font-medium text-foreground">
          {filteredRoles.filter((role) => role.is_global && !role.scope_entity_id).length}
        </span>{' '}
        global
      </span>
      <span>
        <span className="font-medium text-foreground">
          {filteredRoles.filter((role) => !role.is_global && !role.scope_entity_id).length}
        </span>{' '}
        organization
      </span>
      <span>
        <span className="font-medium text-foreground">
          {filteredRoles.filter((role) => Boolean(role.scope_entity_id)).length}
        </span>{' '}
        entity-defined
      </span>
      <span>
        <span className="font-medium text-foreground">
          {filteredRoles.filter((role) => role.is_auto_assigned).length}
        </span>{' '}
        auto
      </span>
      <span>
        <span className="font-medium text-foreground">
          {filteredRoles.filter((role) => role.is_system_role).length}
        </span>{' '}
        system
      </span>
    </div>
  )

  if (sessionQuery.isPending || actorPermissionsQuery.isPending || authConfigQuery.isPending) {
    return <AppLoadingState title="Loading roles workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="Roles" hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(
            pageError,
            'The roles workspace could not load data from the auth API.'
          )}
        </AppErrorState>
      </AppPage>
    )
  }

  return (
    <>
      <AppPage
        className="flex-1 min-h-0 gap-0 overflow-hidden"
        title="Roles"
        hideTitle
        padded={!canReadRoles}
        shellMeta={canReadRoles ? rolesSummary : undefined}
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
        action={
          canReadRoles ? (
            <AppToolbar variant="plain" className="min-w-0 p-4">
              <RolesFiltersBar
                key={searchKey}
                search={search}
                rootOptions={rootOptions}
                entityTypes={entityTypes}
                onApply={onSearchChange}
                onReset={() => onSearchChange({})}
              />
            </AppToolbar>
          ) : undefined
        }
      >
        {!canReadRoles ? (
          <AppEmptyState
            title="Role catalog unavailable"
            description="Your current session cannot read the role catalog."
            compact
          />
        ) : (
          <RolesTable
            roles={filteredRoles}
            isLoading={rolesQuery.isPending}
            isRefreshing={rolesQuery.isRefetching && !rolesQuery.isPending && !rolesQuery.isFetchingNextPage}
            hasNextPage={rolesQuery.hasNextPage}
            isFetchingNextPage={rolesQuery.isFetchingNextPage}
            onLoadMore={() => rolesQuery.fetchNextPage()}
            onRoleSelect={(roleId) => onRoleSelect(roleId)}
            plain
            showHeader={false}
          />
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
