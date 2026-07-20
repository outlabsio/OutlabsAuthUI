import { useState, type ReactNode } from 'react'

import { ArrowRight, FolderTree, ShieldPlus, UserPlus, Users } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppSection } from '@/components/app/app-section'
import { AppStatusBadge } from '@/components/app/app-status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EntityActivityPanel } from '@/features/entities/components/entity-activity-panel'
import { EntityMembersTable } from '@/features/entities/components/entity-members-table'
import type { Entity, EntityMember } from '@/features/entities/types/entities.types'
import {
  formatEntityToken,
  getEntityClassLabel,
  getEntityStatusTone,
} from '@/features/entities/utils/entity-display'
import type { Role } from '@/features/roles/types/roles.types'
import { RolesTable } from '@/features/roles/components/roles-table'

type EntityDetailPanelProps = {
  scopeRoot: Entity | null
  entity: Entity | null
  selectionErrorMessage?: string | null
  path: Entity[]
  scopeEntityCount: number
  descendantCount: number
  directChildren: Entity[]
  members: EntityMember[]
  membersLoading: boolean
  membersRefreshing: boolean
  membersErrorMessage?: string | null
  canLoadMoreMembers: boolean
  onLoadMoreMembers: () => void
  roles: Role[]
  rolesLoading: boolean
  rolesErrorMessage?: string | null
  canCreateRootEntities: boolean
  canCreateChildEntities: boolean
  canEditEntities: boolean
  canMoveEntities: boolean
  canDeleteEntities: boolean
  canCreateRoles: boolean
  canUpdateRoles: boolean
  canAddMembers: boolean
  canEditMemberships: boolean
  canInviteMembers: boolean
  canReadMembers: boolean
  canReadRoles: boolean
  canEditRootGovernance: boolean
  onEntitySelect: (entityId: string) => void
  onCreateRoot: () => void
  onCreateChild: () => void
  onEditEntity: () => void
  onMoveEntity: () => void
  onDeleteEntity: () => void
  onEditRootGovernance: () => void
  onRoleSelect: (roleId: string) => void
  onCreateRole: () => void
  onEditRole: () => void
  onAddMember: (initialRoleIds?: string[]) => void
  onInviteMember: (initialRoleIds?: string[]) => void
  onManageMember: (member: EntityMember) => void
  selectedRoleId?: string
}

type EntityContextTab =
  | 'configuration'
  | 'governance'
  | 'children'
  | 'roles'
  | 'members'
  | 'activity'

function CompactDetailList({
  title,
  items,
}: {
  title: string
  items: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        {title}
      </div>
      <dl className="grid gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid gap-1 border-b border-border/60 pb-3 last:border-b-0 last:pb-0"
          >
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {item.label}
            </dt>
            <dd className="text-sm font-medium text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function formatDateTime(value?: string | null, fallback = 'Not set') {
  if (!value) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatList(values?: string[] | null, fallback = 'No restriction') {
  if (!values || values.length === 0) {
    return fallback
  }

  return values.map((value) => formatEntityToken(value)).join(', ')
}

export function EntityDetailPanel({
  scopeRoot,
  entity,
  selectionErrorMessage,
  path,
  scopeEntityCount,
  descendantCount,
  directChildren,
  members,
  membersLoading,
  membersRefreshing,
  membersErrorMessage,
  canLoadMoreMembers,
  onLoadMoreMembers,
  roles,
  rolesLoading,
  rolesErrorMessage,
  canCreateRootEntities,
  canCreateChildEntities,
  canEditEntities,
  canMoveEntities,
  canDeleteEntities,
  canCreateRoles,
  canUpdateRoles,
  canAddMembers,
  canEditMemberships,
  canInviteMembers,
  canReadMembers,
  canReadRoles,
  canEditRootGovernance,
  onEntitySelect,
  onCreateRoot,
  onCreateChild,
  onEditEntity,
  onMoveEntity,
  onDeleteEntity,
  onEditRootGovernance,
  onRoleSelect,
  onCreateRole,
  onEditRole,
  onAddMember,
  onInviteMember,
  onManageMember,
  selectedRoleId,
}: EntityDetailPanelProps) {
  const [activeContextTab, setActiveContextTab] =
    useState<EntityContextTab>('configuration')

  if (!entity) {
    return (
      <AppEmptyState
        title="No entity selected"
        description="Pick a scope from the hierarchy to start working."
        icon={<FolderTree className="size-7" />}
        className="min-h-[40svh] border-border/80 bg-card/80"
        action={
          canCreateRootEntities ? (
            <Button type="button" onClick={onCreateRoot}>
              Create first root entity
            </Button>
          ) : null
        }
      />
    )
  }

  const parentEntity = path.length > 1 ? path[path.length - 2] : null
  const showMemberActions = canEditMemberships
  const canShowMembersTable = canReadMembers
  const rolesCountLabel = rolesLoading ? '...' : String(roles.length)
  const membersCountLabel = membersLoading ? '...' : String(members.length)
  const isRootEntity = entity.parent_entity_id == null
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null
  const canEditSelectedRole =
    canUpdateRoles &&
    Boolean(
      selectedRole &&
        (selectedRole.scope_entity_id === entity.id ||
          (entity.parent_entity_id == null &&
            selectedRole.root_entity_id === entity.id &&
            selectedRole.scope_entity_id == null))
    )

  const entityContextAction = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canEditEntities && !(activeContextTab === 'governance' && canEditRootGovernance) ? (
        <Button type="button" variant="outline" onClick={onEditEntity}>
          Edit entity
        </Button>
      ) : null}
      {canMoveEntities && !isRootEntity ? (
        <Button type="button" variant="outline" onClick={onMoveEntity}>
          Move entity
        </Button>
      ) : null}
      {canDeleteEntities && entity.status !== 'archived' ? (
        <Button type="button" variant="destructive" onClick={onDeleteEntity}>
          Archive entity
        </Button>
      ) : null}
      {activeContextTab === 'governance' && canEditRootGovernance ? (
        <Button type="button" onClick={onEditRootGovernance}>
          Edit root governance
        </Button>
      ) : null}
      {activeContextTab === 'children' && canCreateChildEntities ? (
        <Button type="button" variant="outline" onClick={onCreateChild}>
          Create child
        </Button>
      ) : null}
      {activeContextTab === 'roles' && canCreateRoles ? (
        <Button type="button" variant="outline" onClick={onCreateRole}>
          <ShieldPlus className="size-4" />
          Create role here
        </Button>
      ) : null}
      {activeContextTab === 'roles' && canEditSelectedRole ? (
        <Button type="button" onClick={onEditRole}>
          Edit role
        </Button>
      ) : null}
      {activeContextTab === 'members' ? (
        <>
          {membersRefreshing ? (
            <Badge variant="outline">Refreshing…</Badge>
          ) : null}
          {canAddMembers ? (
            <Button type="button" variant="outline" onClick={() => onAddMember()}>
              <Users className="size-4" />
              Add member
            </Button>
          ) : null}
          {canInviteMembers ? (
            <Button type="button" onClick={() => onInviteMember()}>
              <UserPlus className="size-4" />
              Invite member
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-4">
      {selectionErrorMessage ? (
        <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground">
          {selectionErrorMessage}
        </div>
      ) : null}

      <Card className="bg-card/95 shadow-none">
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0 space-y-1.5">
            <div className="min-w-0 text-xs text-muted-foreground">
              <Breadcrumb>
                <BreadcrumbList>
                  {path.map((pathEntity, index) => {
                    const isLast = index === path.length - 1

                    return (
                      <div key={pathEntity.id} className="flex items-center gap-1.5">
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{pathEntity.display_name}</BreadcrumbPage>
                          ) : (
                            <button
                              type="button"
                              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                              onClick={() => onEntitySelect(pathEntity.id)}
                            >
                              {pathEntity.display_name}
                            </button>
                          )}
                        </BreadcrumbItem>
                        {!isLast ? <BreadcrumbSeparator /> : null}
                      </div>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {entity.display_name}
              </h2>
              <AppStatusBadge tone={getEntityStatusTone(entity.status)}>
                {formatEntityToken(entity.status)}
              </AppStatusBadge>
            </div>

            {entity.description ? (
              <p className="truncate text-xs text-muted-foreground">
                {entity.description}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border bg-muted/20 px-3 py-2.5">
            <div className="grid gap-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Type
                </span>
                <span className="font-medium text-foreground">
                  {formatEntityToken(entity.entity_type)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Class
                </span>
                <span className="font-medium text-foreground">
                  {getEntityClassLabel(entity.entity_class)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Slug
                </span>
                <span className="truncate text-right font-mono text-xs text-foreground">
                  {entity.slug}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 px-3 py-2.5">
            <div className="grid gap-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Root
                </span>
                <span className="truncate text-right font-medium text-foreground">
                  {scopeRoot?.display_name ?? entity.display_name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Scope
                </span>
                <span className="text-right text-foreground">
                  {scopeEntityCount} in scope · {descendantCount} down
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Access
                </span>
                <span className="text-right text-foreground">
                  {membersCountLabel} members · {rolesCountLabel} roles
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AppSection
        title="Entity context"
        info={{
          label: 'Explain entity context tabs',
          title: 'Entity context',
          content:
            'Use these tabs to inspect stable configuration, the immediate child branch, the local role catalog, member access, and retained entity activity without stacking separate sections down the page.',
        }}
        action={entityContextAction}
      >
        <Tabs
          value={activeContextTab}
          onValueChange={(value) => {
            if (
              value === 'configuration' ||
              value === 'governance' ||
              value === 'children' ||
              value === 'roles' ||
              value === 'members' ||
              value === 'activity'
            ) {
              setActiveContextTab(value)
            }
          }}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="configuration">Configuration snapshot</TabsTrigger>
            {isRootEntity ? (
              <TabsTrigger value="governance">Root governance</TabsTrigger>
            ) : null}
            <TabsTrigger value="children">Child entities</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="members">Members and access</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="configuration" className="pt-1">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <CompactDetailList
                title="Identity"
                items={[
                  { label: 'System name', value: entity.name },
                  { label: 'Slug', value: entity.slug },
                  {
                    label: 'Parent',
                    value: parentEntity?.display_name ?? 'Root entity',
                  },
                  { label: 'Entity type', value: formatEntityToken(entity.entity_type) },
                  { label: 'Entity class', value: getEntityClassLabel(entity.entity_class) },
                  { label: 'Valid from', value: formatDateTime(entity.valid_from) },
                  {
                    label: 'Valid until',
                    value: formatDateTime(entity.valid_until, 'Open-ended'),
                  },
                ]}
              />

              <CompactDetailList
                title={isRootEntity ? 'Operational context' : 'Governance'}
                items={
                  isRootEntity
                    ? [
                        {
                          label: 'Current path',
                          value: path.map((pathEntity) => pathEntity.display_name).join(' / '),
                        },
                        {
                          label: 'Immediate children',
                          value: `${directChildren.length} direct`,
                        },
                        {
                          label: 'Descendant reach',
                          value: `${descendantCount} downstream`,
                        },
                        {
                          label: 'Scope view',
                          value: `${scopeEntityCount} entities in scope`,
                        },
                      ]
                    : [
                        {
                          label: 'Allowed child classes',
                          value: formatList(entity.allowed_child_classes),
                        },
                        {
                          label: 'Allowed child types',
                          value: formatList(entity.allowed_child_types),
                        },
                        {
                          label: 'Member cap',
                          value:
                            entity.max_members != null
                              ? `${entity.max_members} members`
                              : 'Unlimited',
                        },
                        {
                          label: 'Current path',
                          value: path.map((pathEntity) => pathEntity.display_name).join(' / '),
                        },
                      ]
                }
              />
            </div>
          </TabsContent>

          {isRootEntity ? (
            <TabsContent value="governance" className="pt-1">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <CompactDetailList
                  title="Branch vocabulary"
                  items={[
                    {
                      label: 'Allowed child classes',
                      value: formatList(entity.allowed_child_classes),
                    },
                    {
                      label: 'Allowed child types',
                      value: formatList(entity.allowed_child_types),
                    },
                    {
                      label: 'Default member cap',
                      value:
                        entity.max_members != null ? `${entity.max_members} members` : 'Unlimited',
                    },
                  ]}
                />

                <CompactDetailList
                  title="Naming rules"
                  items={[
                    {
                      label: 'System-name pattern',
                      value: entity.child_name_pattern ?? 'No rule configured',
                    },
                    {
                      label: 'Display-name pattern',
                      value: entity.child_display_name_pattern ?? 'No rule configured',
                    },
                    {
                      label: 'Slug pattern',
                      value: entity.child_slug_pattern ?? 'No rule configured',
                    },
                    {
                      label: 'Operator guidance',
                      value:
                        entity.child_naming_guidance ??
                        'No additional naming guidance configured.',
                    },
                  ]}
                />
              </div>
            </TabsContent>
          ) : null}

          <TabsContent value="children" className="pt-1">
            {directChildren.length > 0 ? (
              <div className="space-y-3">
                {directChildren.map((childEntity) => (
                  <button
                    key={childEntity.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-muted/25"
                    onClick={() => onEntitySelect(childEntity.id)}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{childEntity.display_name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatEntityToken(childEntity.entity_type)}</span>
                        <span>&#8226;</span>
                        <span>{getEntityClassLabel(childEntity.entity_class)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <AppStatusBadge tone={getEntityStatusTone(childEntity.status)}>
                        {formatEntityToken(childEntity.status)}
                      </AppStatusBadge>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <AppEmptyState
                title="No child entities"
                description="No direct child entities yet."
                compact
              />
            )}
          </TabsContent>

          <TabsContent value="roles" className="pt-1">
            {!canReadRoles ? (
              <AppEmptyState
                title="Roles unavailable"
                description="Your account cannot inspect entity role catalogs."
                compact
              />
            ) : rolesErrorMessage ? (
              <AppErrorState compact>{rolesErrorMessage}</AppErrorState>
            ) : rolesLoading ? (
              <AppEmptyState title="Loading roles…" compact />
            ) : (
              <div className="flex h-[28rem] min-h-[24rem] max-h-[60svh] min-w-0 flex-col overflow-hidden">
                <RolesTable
                  roles={roles}
                  selectedRoleId={selectedRoleId}
                  isLoading={false}
                  isRefreshing={false}
                  onRoleSelect={onRoleSelect}
                  embedded
                  showHeader={false}
                  emptyTitle="No roles are available in this entity context."
                  emptyDescription="Create a role here or adjust the current entity scope."
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="pt-1">
            <EntityMembersTable
              members={members}
              membersLoading={membersLoading}
              membersErrorMessage={membersErrorMessage}
              canReadMembers={canShowMembersTable}
              canEditMemberships={showMemberActions}
              canLoadMoreMembers={canLoadMoreMembers}
              onLoadMoreMembers={onLoadMoreMembers}
              onManageMember={onManageMember}
            />
          </TabsContent>

          <TabsContent value="activity" className="pt-1">
            <EntityActivityPanel
              entityId={entity.id}
              entityDisplayName={entity.display_name}
            />
          </TabsContent>
        </Tabs>
      </AppSection>
    </div>
  )
}
