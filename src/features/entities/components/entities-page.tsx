import { useEffect, useMemo, useState } from 'react'

import { useQueries, useQuery } from '@tanstack/react-query'
import { Building2, Plus } from 'lucide-react'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getEntitiesQueryOptions } from '@/features/entities/api/entities.query-options'
import {
  getEntityDescendantsQueryOptions,
  getEntityMembersQueryOptions,
  getEntityPathQueryOptions,
  getEntityQueryOptions,
} from '@/features/entities/api/entities.query-options'
import { EntityDetailPanel } from '@/features/entities/components/entity-detail-panel'
import { EntityFormDialog } from '@/features/entities/components/entity-form-dialog'
import { EntityMemberAccessDialog } from '@/features/entities/components/entity-member-access-dialog'
import { EntityMemberInviteDialog } from '@/features/entities/components/entity-member-invite-dialog'
import { EntityTreePanel } from '@/features/entities/components/entity-tree-panel'
import { getRolesForEntityQueryOptions } from '@/features/roles/api/roles.query-options'
import {
  buildEntityTree,
  filterEntityTree,
  findEntityPath,
  flattenEntityTree,
} from '@/features/entities/utils/build-entity-tree'
import type {
  Entity,
  EntityMember,
  EntitiesPageSearch,
} from '@/features/entities/types/entities.types'
import { getUserPermissionsQueryOptions } from '@/features/users/api/users.query-options'
import { getApiErrorMessage } from '@/lib/api/errors'

const entityMembersPageSize = 50

type EntitiesPageProps = {
  selectedEntityId?: string
  search: EntitiesPageSearch
  onSearchChange: (next: EntitiesPageSearch) => void
  onEntitySelect: (entityId?: string) => void
}

type EntityFormDialogState = {
  open: boolean
  mode: 'create' | 'edit'
  entity: Entity | null
  parentEntity: Entity | null
}

function hasAnyPermission(permissionNames: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}

function uniqueEntities(entities: Array<Entity | null | undefined>) {
  const entitiesById = new Map<string, Entity>()

  entities.forEach((entity) => {
    if (!entity) {
      return
    }

    entitiesById.set(entity.id, entity)
  })

  return [...entitiesById.values()]
}

function countDescendants(
  entityId: string,
  entitiesByParentId: Map<string | null, Entity[]>
): number {
  const directChildren = entitiesByParentId.get(entityId) ?? []

  return directChildren.reduce((count, childEntity) => {
    return count + 1 + countDescendants(childEntity.id, entitiesByParentId)
  }, 0)
}

export function EntitiesPage({
  selectedEntityId,
  search,
  onSearchChange,
  onEntitySelect,
}: EntitiesPageProps) {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const isSuperuser = Boolean(sessionUser?.is_superuser)
  const actorPermissionsQuery = useQuery({
    ...getUserPermissionsQueryOptions(sessionUser?.id ?? ''),
    enabled: Boolean(sessionUser?.id),
  })
  const rootEntitiesQuery = useQuery({
    ...getEntitiesQueryOptions({
      page: 1,
      limit: 100,
      rootOnly: true,
    }),
    enabled: isSuperuser,
  })
  const selectedEntityPathQuery = useQuery({
    ...getEntityPathQueryOptions(selectedEntityId ?? ''),
    enabled: Boolean(selectedEntityId),
  })

  const actorPermissionNames = useMemo(
    () => new Set((actorPermissionsQuery.data ?? []).map((item) => item.permission.name)),
    [actorPermissionsQuery.data]
  )
  const canCreateEntities = hasAnyPermission(actorPermissionNames, [
    'entity:create',
    'entity:create_tree',
    'entity:create_all',
  ])
  const canEditEntities = hasAnyPermission(actorPermissionNames, [
    'entity:update',
    'entity:update_tree',
    'entity:update_all',
  ])
  const canReadMembers = hasAnyPermission(actorPermissionNames, ['membership:read'])
  const canCreateMemberships = hasAnyPermission(actorPermissionNames, ['membership:create'])
  const canUpdateMemberships = hasAnyPermission(actorPermissionNames, ['membership:update'])
  const canRemoveMemberships = hasAnyPermission(actorPermissionNames, ['membership:delete'])
  const canManageExistingMemberships = canUpdateMemberships || canRemoveMemberships
  const canInviteMembers = hasAnyPermission(actorPermissionNames, ['user:create'])
  const canReadRoles = hasAnyPermission(actorPermissionNames, ['role:read'])
  const canCreateRootEntities = Boolean(isSuperuser && canCreateEntities)

  const rootOptions = useMemo(
    () =>
      uniqueEntities([
        ...(rootEntitiesQuery.data?.items ?? []),
        selectedEntityPathQuery.data?.[0],
      ]).sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [rootEntitiesQuery.data?.items, selectedEntityPathQuery.data]
  )
  const selectedRootIdFromPath = selectedEntityPathQuery.data?.[0]?.id
  const firstRootId = rootOptions[0]?.id
  const activeRootId = useMemo(() => {
    if (isSuperuser) {
      if (
        search.scopeRootId &&
        (rootOptions.length === 0 ||
          rootOptions.some((entityOption) => entityOption.id === search.scopeRootId))
      ) {
        return search.scopeRootId
      }

      return selectedRootIdFromPath ?? firstRootId ?? null
    }

    return sessionUser?.root_entity_id ?? selectedRootIdFromPath ?? null
  }, [
    firstRootId,
    isSuperuser,
    rootOptions,
    search.scopeRootId,
    selectedRootIdFromPath,
    sessionUser?.root_entity_id,
  ])

  const activeRootQuery = useQuery({
    ...getEntityQueryOptions(activeRootId ?? ''),
    enabled: Boolean(activeRootId),
  })
  const descendantsQuery = useQuery({
    ...getEntityDescendantsQueryOptions(activeRootId ?? ''),
    enabled: Boolean(activeRootId),
  })
  const selectedEntityQuery = useQuery({
    ...getEntityQueryOptions(selectedEntityId ?? ''),
    enabled: Boolean(selectedEntityId) && selectedEntityId !== activeRootId,
  })

  const scopeEntities = useMemo(
    () =>
      uniqueEntities([activeRootQuery.data, ...(descendantsQuery.data ?? [])]).sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [activeRootQuery.data, descendantsQuery.data]
  )
  const entitiesByParentId = useMemo(() => {
    const nextMap = new Map<string | null, Entity[]>()

    scopeEntities.forEach((entity) => {
      const parentId = entity.parent_entity_id ?? null
      const siblings = nextMap.get(parentId) ?? []
      siblings.push(entity)
      nextMap.set(parentId, siblings)
    })

    return nextMap
  }, [scopeEntities])
  const entityTree = useMemo(() => buildEntityTree(scopeEntities), [scopeEntities])
  const filteredEntityTree = useMemo(
    () => filterEntityTree(entityTree, search.search ?? ''),
    [entityTree, search.search]
  )
  const allScopeNodes = useMemo(() => flattenEntityTree(entityTree), [entityTree])
  const visibleScopeNodes = useMemo(() => flattenEntityTree(filteredEntityTree), [filteredEntityTree])
  const entitiesById = useMemo(
    () => new Map(allScopeNodes.map((entityNode) => [entityNode.id, entityNode])),
    [allScopeNodes]
  )

  const selectedEntityWithinScope: Entity | null = selectedEntityId
    ? entitiesById.get(selectedEntityId) ??
      (selectedEntityId === activeRootId ? activeRootQuery.data ?? null : null)
    : null
  const selectedEntityOutsideCurrentScope =
    Boolean(selectedEntityId) &&
    Boolean(selectedRootIdFromPath) &&
    Boolean(activeRootId) &&
    selectedRootIdFromPath !== activeRootId

  const activeEntity: Entity | null =
    selectedEntityWithinScope ??
    (selectedEntityId
      ? selectedEntityId === activeRootId
        ? activeRootQuery.data ?? null
        : null
      : null) ??
    (!selectedEntityOutsideCurrentScope ? selectedEntityQuery.data ?? null : null) ??
    activeRootQuery.data ??
    null
  const activeEntityNode = activeEntity ? entitiesById.get(activeEntity.id) ?? null : null
  const activeEntityPath = useMemo(() => {
    if (!activeEntity) {
      return []
    }

    const treePath = findEntityPath(entityTree, activeEntity.id)

    if (treePath.length > 0) {
      return treePath
    }

    if (selectedEntityId && activeEntity.id === selectedEntityId) {
      return selectedEntityPathQuery.data ?? [activeEntity]
    }

    return [activeEntity]
  }, [activeEntity, entityTree, selectedEntityId, selectedEntityPathQuery.data])
  const activeEntityPathIds = useMemo(
    () => activeEntityPath.map((pathEntity) => pathEntity.id),
    [activeEntityPath]
  )
  const directChildren = activeEntityNode?.children ?? []
  const descendantCount = activeEntity
    ? countDescendants(activeEntity.id, entitiesByParentId)
    : 0

  const [memberPagesLoaded, setMemberPagesLoaded] = useState(1)
  const memberQueries = useQueries({
    queries:
      activeEntity && canReadMembers
        ? Array.from({ length: memberPagesLoaded }, (_, index) => ({
            ...getEntityMembersQueryOptions(activeEntity.id, {
              page: index + 1,
              limit: entityMembersPageSize,
              includeInactive: true,
            }),
            enabled: Boolean(activeEntity.id),
          }))
        : [],
  })

  useEffect(() => {
    setMemberPagesLoaded(1)
  }, [activeEntity?.id])

  const entityRolesQuery = useQuery({
    ...getRolesForEntityQueryOptions(activeEntity?.id ?? '', {
      page: 1,
      limit: 100,
    }),
    enabled: Boolean(activeEntity?.id) && canReadRoles,
  })

  const members = useMemo(
    () => memberQueries.flatMap((memberQuery) => memberQuery.data ?? []),
    [memberQueries]
  )
  const membersError = memberQueries.find((memberQuery) => memberQuery.error)?.error
  const roles = entityRolesQuery.data?.items ?? []
  const rolesError = entityRolesQuery.error
  const membersLoading =
    Boolean(activeEntity) &&
    canReadMembers &&
    (memberQueries.length === 0 || memberQueries.every((memberQuery) => memberQuery.isPending))
  const membersRefreshing = memberQueries.some(
    (memberQuery) => memberQuery.isFetching && !memberQuery.isPending
  )
  const lastMembersPage = memberQueries[memberQueries.length - 1]?.data ?? []
  const canLoadMoreMembers =
    canReadMembers &&
    !membersLoading &&
    lastMembersPage.length === entityMembersPageSize

  const [entityFormDialogState, setEntityFormDialogState] = useState<EntityFormDialogState>({
    open: false,
    mode: 'create',
    entity: null,
    parentEntity: null,
  })
  const [memberAccessDialogState, setMemberAccessDialogState] = useState<{
    open: boolean
    member: EntityMember | null
  }>({
    open: false,
    member: null,
  })
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  const pageError =
    sessionQuery.error ??
    (isSuperuser ? rootEntitiesQuery.error : null) ??
    activeRootQuery.error ??
    descendantsQuery.error
  const pageErrorMessage = pageError
    ? getApiErrorMessage(pageError, 'The entity workspace could not load from the auth API.')
    : null
  const selectionErrorMessage = selectedEntityPathQuery.error
    ? getApiErrorMessage(
        selectedEntityPathQuery.error,
        'The selected entity could not be loaded from the hierarchy.'
      )
    : selectedEntityOutsideCurrentScope
      ? 'The selected entity belongs to a different root scope. The detail workspace is showing the current scope instead.'
      : null
  const membersErrorMessage = membersError
    ? getApiErrorMessage(membersError, 'The entity members could not be loaded.')
    : null
  const rolesErrorMessage = rolesError
    ? getApiErrorMessage(rolesError, 'The role catalog for this entity could not be loaded.')
    : null

  const isPageLoading =
    sessionQuery.isPending ||
    (Boolean(activeRootId) &&
      ((activeRootQuery.isPending && !activeRootQuery.data) ||
        (descendantsQuery.isPending && !descendantsQuery.data)))

  if (isPageLoading && !pageErrorMessage) {
    return (
      <AppLoadingState
        title="Loading entity workspace"
        description="Reading the visible hierarchy, resolving the active root, and preparing the management surface."
      />
    )
  }

  function handleScopeRootChange(nextRootId: string) {
    onSearchChange({
      ...search,
      scopeRootId: nextRootId,
    })
  }

  function handleEntityFormSuccess(nextEntity: Entity) {
    if (!nextEntity.parent_entity_id && isSuperuser) {
      onSearchChange({
        ...search,
        scopeRootId: nextEntity.id,
      })
      onEntitySelect(undefined)
      return
    }

    onEntitySelect(nextEntity.id)
  }

  const headerAction = (
    <div className="flex w-full flex-wrap items-center gap-2 xl:flex-nowrap">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{allScopeNodes.length}</span> entities
        </span>
        <span>
          <span className="font-medium text-foreground">{directChildren.length}</span> direct children
        </span>
        <span>
          <span className="font-medium text-foreground">{members.length}</span> members loaded
        </span>
      </div>

      <div className="min-w-0 flex-1 rounded-xl border bg-card/70 px-3 py-2.5 text-sm text-muted-foreground">
        {activeRootQuery.data ? (
          <>
            Working inside <span className="font-medium text-foreground">{activeRootQuery.data.display_name}</span>.
            {' '}Search stays in the URL so admins can share or revisit a specific scope view.
          </>
        ) : (
          'No root scope is active yet.'
        )}
      </div>

      {canCreateRootEntities ? (
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            setEntityFormDialogState({
              open: true,
              mode: 'create',
              entity: null,
              parentEntity: null,
            })
          }}
        >
          <Building2 className="size-4" />
          Create root
        </Button>
      ) : null}

      {canCreateEntities && activeEntity ? (
        <Button
          type="button"
          className="shrink-0"
          onClick={() => {
            setEntityFormDialogState({
              open: true,
              mode: 'create',
              entity: null,
              parentEntity: activeEntity,
            })
          }}
        >
          <Plus className="size-4" />
          Create child
        </Button>
      ) : null}
    </div>
  )

  return (
    <>
      <AppPage
        className="flex-1 min-h-0 gap-4 overflow-hidden"
        eyebrow="Administration"
        title="Entities"
        description="Navigate entity hierarchies, shape each scope, and manage who belongs where without losing the path context."
        action={headerAction}
      >
        {pageErrorMessage ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {pageErrorMessage}
          </div>
        ) : !activeRootId ? (
          <Card className="flex min-h-[40svh] items-center justify-center border border-dashed border-border/80 bg-card/80">
            <CardContent className="max-w-lg space-y-4 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-accent text-accent-foreground">
                <Building2 className="size-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">No entity scope available</h2>
                <p className="text-sm text-muted-foreground">
                  This account does not currently resolve to a root entity. Create a root scope or attach the account to one before continuing.
                </p>
              </div>
              {canCreateRootEntities ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    onClick={() => {
                      setEntityFormDialogState({
                        open: true,
                        mode: 'create',
                        entity: null,
                        parentEntity: null,
                      })
                    }}
                  >
                    Create root entity
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <EntityTreePanel
              rootEntity={activeRootQuery.data ?? null}
              rootOptions={rootOptions}
              canSwitchRoot={isSuperuser}
              selectedRootId={activeRootId ?? undefined}
              searchValue={search.search ?? ''}
              totalCount={allScopeNodes.length}
              visibleCount={visibleScopeNodes.length}
              selectedPathIds={activeEntityPathIds}
              selectedEntityId={activeEntity?.id}
              tree={filteredEntityTree}
              onSearchChange={(nextSearch) => {
                onSearchChange({
                  ...search,
                  search: nextSearch || undefined,
                })
              }}
              onRootChange={handleScopeRootChange}
              onEntitySelect={(entityId) => onEntitySelect(entityId)}
            />

            <div className="min-h-0 overflow-auto pr-1">
              <EntityDetailPanel
                scopeRoot={activeRootQuery.data ?? null}
                entity={activeEntity}
                selectionErrorMessage={selectionErrorMessage}
                path={activeEntityPath}
                scopeEntityCount={allScopeNodes.length}
                descendantCount={descendantCount}
                directChildren={directChildren}
                members={members}
                membersLoading={membersLoading}
                membersRefreshing={membersRefreshing}
                membersErrorMessage={membersErrorMessage}
                canLoadMoreMembers={canLoadMoreMembers}
                onLoadMoreMembers={() => setMemberPagesLoaded((currentValue) => currentValue + 1)}
                roles={roles}
                rolesLoading={entityRolesQuery.isPending}
                rolesErrorMessage={rolesErrorMessage}
                canCreateRootEntities={canCreateRootEntities}
                canCreateChildEntities={canCreateEntities && Boolean(activeEntity)}
                canEditEntities={canEditEntities}
                canAddMembers={canCreateMemberships}
                canEditMemberships={canManageExistingMemberships}
                canInviteMembers={canInviteMembers}
                canReadMembers={canReadMembers}
                canReadRoles={canReadRoles}
                onEntitySelect={(entityId) => onEntitySelect(entityId)}
                onCreateRoot={() => {
                  setEntityFormDialogState({
                    open: true,
                    mode: 'create',
                    entity: null,
                    parentEntity: null,
                  })
                }}
                onCreateChild={() => {
                  setEntityFormDialogState({
                    open: true,
                    mode: 'create',
                    entity: null,
                    parentEntity: activeEntity,
                  })
                }}
                onEditEntity={() => {
                  setEntityFormDialogState({
                    open: true,
                    mode: 'edit',
                    entity: activeEntity,
                    parentEntity:
                      activeEntityPath.length > 1
                        ? activeEntityPath[activeEntityPath.length - 2]
                        : null,
                  })
                }}
                onAddMember={() => {
                  setMemberAccessDialogState({
                    open: true,
                    member: null,
                  })
                }}
                onInviteMember={() => setInviteDialogOpen(true)}
                onManageMember={(member) => {
                  setMemberAccessDialogState({
                    open: true,
                    member,
                  })
                }}
              />
            </div>
          </div>
        )}
      </AppPage>

      <EntityFormDialog
        open={entityFormDialogState.open}
        onOpenChange={(open) => {
          setEntityFormDialogState((currentState) => ({
            ...currentState,
            open,
          }))
        }}
        mode={entityFormDialogState.mode}
        entity={entityFormDialogState.entity}
        parentEntity={entityFormDialogState.parentEntity}
        onSuccess={handleEntityFormSuccess}
      />

      {activeEntity ? (
        <>
          <EntityMemberAccessDialog
            open={memberAccessDialogState.open}
            onOpenChange={(open) => {
              setMemberAccessDialogState((currentState) => ({
                ...currentState,
                open,
              }))
            }}
            entity={activeEntity}
            availableRoles={roles}
            existingMember={memberAccessDialogState.member}
            existingUserIds={members.map((member) => member.user_id)}
            rootEntityId={activeRootId ?? undefined}
            canCreateMemberships={canCreateMemberships}
            canUpdateMemberships={canUpdateMemberships}
            canRemoveMemberships={canRemoveMemberships}
          />

          <EntityMemberInviteDialog
            open={inviteDialogOpen}
            onOpenChange={setInviteDialogOpen}
            entity={activeEntity}
            availableRoles={roles}
            canInviteMembers={canInviteMembers}
          />
        </>
      ) : null}
    </>
  )
}
