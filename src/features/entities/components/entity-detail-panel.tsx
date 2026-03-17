import type { ReactNode } from 'react'

import {
  ArrowRight,
  Building2,
  FolderTree,
  UserPlus,
  Users,
} from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Entity, EntityMember } from '@/features/entities/types/entities.types'
import {
  formatEntityToken,
  getEntityClassLabel,
  getEntityStatusVariant,
} from '@/features/entities/utils/entity-display'
import {
  formatMembershipToken,
  getMembershipStatusVariant,
} from '@/features/memberships/utils/membership-display'
import type { Role } from '@/features/roles/types/roles.types'
import { getRoleScopeSummary } from '@/features/roles/utils/role-display'
import { cn } from '@/lib/utils/cn'

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
  canAddMembers: boolean
  canEditMemberships: boolean
  canInviteMembers: boolean
  canReadMembers: boolean
  canReadRoles: boolean
  onEntitySelect: (entityId: string) => void
  onCreateRoot: () => void
  onCreateChild: () => void
  onEditEntity: () => void
  onAddMember: () => void
  onInviteMember: () => void
  onManageMember: (member: EntityMember) => void
}

type DetailFieldProps = {
  label: string
  value: ReactNode
}

type EntityMetricProps = {
  label: string
  value: string
}

type DetailSectionInfo = {
  label: string
  title: string
  content: ReactNode
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="space-y-1 rounded-2xl border bg-muted/20 px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  )
}

function EntityMetric({ label, value }: EntityMetricProps) {
  return (
    <div className="rounded-2xl border bg-background/80 px-4 py-3">
      <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  )
}

function DetailSection({
  title,
  description,
  action,
  info,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  info?: DetailSectionInfo
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('border border-border/70 bg-card/90', className)}>
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle>{title}</CardTitle>
              {info ? (
                <AppInfoPopover label={info.label} title={info.title}>
                  {info.content}
                </AppInfoPopover>
              ) : null}
            </div>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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

function getMemberDisplayName(member: EntityMember) {
  const displayName = [member.user_first_name, member.user_last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return displayName || member.user_email
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
  canAddMembers,
  canEditMemberships,
  canInviteMembers,
  canReadMembers,
  canReadRoles,
  onEntitySelect,
  onCreateRoot,
  onCreateChild,
  onEditEntity,
  onAddMember,
  onInviteMember,
  onManageMember,
}: EntityDetailPanelProps) {
  if (!entity) {
    return (
      <Card className="flex min-h-[40svh] items-center justify-center border border-dashed border-border/80 bg-card/80">
        <CardContent className="max-w-lg space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-accent text-accent-foreground">
            <FolderTree className="size-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">No entity selected</h2>
            <p className="text-sm text-muted-foreground">
              Pick a scope from the hierarchy to start working.
            </p>
          </div>
          {canCreateRootEntities ? (
            <div className="flex justify-center">
              <Button type="button" onClick={onCreateRoot}>
                Create first root entity
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  const parentEntity = path.length > 1 ? path[path.length - 2] : null
  const showMemberActions = canEditMemberships
  const canShowMembersTable = canReadMembers
  const rolesCountLabel = rolesLoading ? '...' : String(roles.length)
  const membersCountLabel = membersLoading ? '...' : String(members.length)

  return (
    <div className="space-y-4">
      {selectionErrorMessage ? (
        <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground">
          {selectionErrorMessage}
        </div>
      ) : null}

      <Card className="border border-border/70 bg-linear-to-br from-primary/5 via-card to-accent/10">
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <Badge variant="outline" className="gap-1.5">
                <Building2 className="size-3.5" />
                {scopeRoot?.display_name ?? 'Hierarchy scope'}
              </Badge>

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

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                    {entity.display_name}
                  </h2>
                  <Badge variant={getEntityStatusVariant(entity.status)}>
                    {formatEntityToken(entity.status)}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{formatEntityToken(entity.entity_type)}</Badge>
                  <Badge variant="outline">{getEntityClassLabel(entity.entity_class)}</Badge>
                  <Badge variant="outline">{entity.slug}</Badge>
                </div>

                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {entity.description || 'No description yet.'}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              {canEditEntities ? (
                <Button type="button" variant="outline" onClick={onEditEntity}>
                  Edit entity
                </Button>
              ) : null}
              {canCreateChildEntities ? (
                <Button type="button" variant="outline" onClick={onCreateChild}>
                  Create child
                </Button>
              ) : null}
              {canAddMembers ? (
                <Button type="button" variant="outline" onClick={onAddMember}>
                  <Users className="size-4" />
                  Add member
                </Button>
              ) : null}
              {canInviteMembers ? (
                <Button type="button" onClick={onInviteMember}>
                  <UserPlus className="size-4" />
                  Invite member
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <EntityMetric label="Entities in scope" value={String(scopeEntityCount)} />
            <EntityMetric label="Descendants here" value={String(descendantCount)} />
            <EntityMetric label="Members loaded" value={membersCountLabel} />
            <EntityMetric label="Roles available" value={rolesCountLabel} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <DetailSection
          title="Entity overview"
          info={{
            label: 'Explain entity overview',
            title: 'Entity overview',
            content:
              'These fields describe the entity itself: its stable identifiers, where it sits in the tree, and any time bounds on when it should be active.',
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <DetailField label="System name" value={entity.name} />
            <DetailField label="Display name" value={entity.display_name} />
            <DetailField label="Slug" value={entity.slug} />
            <DetailField label="Parent" value={parentEntity?.display_name ?? 'Root entity'} />
            <DetailField label="Entity type" value={formatEntityToken(entity.entity_type)} />
            <DetailField label="Entity class" value={getEntityClassLabel(entity.entity_class)} />
            <DetailField label="Valid from" value={formatDateTime(entity.valid_from)} />
            <DetailField label="Valid until" value={formatDateTime(entity.valid_until, 'Open-ended')} />
          </div>
        </DetailSection>

        <DetailSection
          title="Governance controls"
          info={{
            label: 'Explain governance controls',
            title: 'Governance controls',
            content:
              'These settings constrain what can be created under this entity and how large the membership surface can grow.',
          }}
        >
          <div className="grid gap-3">
            <DetailField
              label="Allowed child classes"
              value={formatList(entity.allowed_child_classes)}
            />
            <DetailField
              label="Allowed child types"
              value={formatList(entity.allowed_child_types)}
            />
            <DetailField
              label="Member cap"
              value={entity.max_members != null ? `${entity.max_members} members` : 'Unlimited'}
            />
            <DetailField
              label="Hierarchy path"
              value={path.map((pathEntity) => pathEntity.display_name).join(' / ')}
            />
          </div>
        </DetailSection>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DetailSection
          title="Child entities"
          info={{
            label: 'Explain child entities',
            title: 'Child entities',
            content:
              'This list only shows the next level down. Use the tree on the left when you need the full branch context.',
          }}
          action={
            canCreateChildEntities ? (
              <Button type="button" variant="outline" onClick={onCreateChild}>
                Create child
              </Button>
            ) : null
          }
        >
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
                    <Badge variant={getEntityStatusVariant(childEntity.status)}>
                      {formatEntityToken(childEntity.status)}
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No direct child entities yet.
            </div>
          )}
        </DetailSection>

        <DetailSection
          title="Assignable roles"
          info={{
            label: 'Explain assignable roles',
            title: 'Assignable roles',
            content:
              'Role availability depends on scope, entity type restrictions, and what the backend allows at this entity. This is the safest place to confirm what can be granted locally.',
          }}
          action={
            canReadRoles ? (
              <Badge variant="outline">{roles.length} role{roles.length === 1 ? '' : 's'}</Badge>
            ) : null
          }
        >
          {!canReadRoles ? (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Your account cannot inspect entity role catalogs.
            </div>
          ) : rolesErrorMessage ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {rolesErrorMessage}
            </div>
          ) : rolesLoading ? (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Loading roles…
            </div>
          ) : roles.length > 0 ? (
            <div className="space-y-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-2xl border bg-muted/15 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{role.display_name}</span>
                    {role.is_auto_assigned ? (
                      <Badge variant="outline">Auto-assigned</Badge>
                    ) : null}
                    <Badge variant="outline">{role.permissions.length} permissions</Badge>
                  </div>
                  {role.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{role.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getRoleScopeSummary(role)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No roles are assignable at this entity yet.
            </div>
          )}
        </DetailSection>
      </div>

      <DetailSection
        title="Members and access"
        info={{
          label: 'Explain members and access',
          title: 'Members and access',
          content:
            'Memberships attach people to this entity. Local roles on a membership can add scoped access inside this branch without changing the user record globally.',
        }}
        action={
          <div className="flex items-center gap-2">
            {membersRefreshing ? (
              <Badge variant="outline">Refreshing…</Badge>
            ) : null}
            {canAddMembers ? (
              <Button type="button" variant="outline" onClick={onAddMember}>
                <Users className="size-4" />
                Add member
              </Button>
            ) : null}
            {canInviteMembers ? (
              <Button type="button" onClick={onInviteMember}>
                <UserPlus className="size-4" />
                Invite
              </Button>
            ) : null}
          </div>
        }
      >
        {!canShowMembersTable ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Your account cannot read memberships in this entity.
          </div>
        ) : membersErrorMessage ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {membersErrorMessage}
          </div>
        ) : membersLoading ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Loading entity members…
          </div>
        ) : members.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Membership</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="whitespace-normal">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {getMemberDisplayName(member)}
                        </div>
                        <div className="text-sm text-muted-foreground">{member.user_email}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>User: {formatMembershipToken(member.user_status)}</span>
                          <span>&#8226;</span>
                          <span>Assignment: {formatMembershipToken(member.status)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-2">
                        {member.roles.length > 0 ? (
                          member.roles.map((role) => (
                            <Badge key={role.id} variant="outline">
                              {role.display_name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No roles</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="space-y-2">
                        <Badge variant={getMembershipStatusVariant(member.effective_status)}>
                          {formatMembershipToken(member.effective_status)}
                        </Badge>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div>From: {formatDateTime(member.valid_from, 'Immediate')}</div>
                          <div>Until: {formatDateTime(member.valid_until, 'Open-ended')}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(member.joined_at)}</TableCell>
                    <TableCell className="text-right">
                      {showMemberActions ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onManageMember(member)}
                        >
                          Manage
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Read only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No memberships have been attached to this entity yet.
          </div>
        )}

        {canLoadMoreMembers ? (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onLoadMoreMembers}>
              Load more members
            </Button>
          </div>
        ) : null}
      </DetailSection>
    </div>
  )
}
