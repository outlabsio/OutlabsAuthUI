import { useMemo } from 'react'

import {
  Layers3,
  Orbit,
  PencilLine,
  ShieldCheck,
  Trash2,
  TreePine,
} from 'lucide-react'

import { AbacConditionsSection } from '@/features/abac/components/abac-conditions-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCreateRoleConditionGroupMutation } from '@/features/roles/hooks/use-create-role-condition-group-mutation'
import { useCreateRoleConditionMutation } from '@/features/roles/hooks/use-create-role-condition-mutation'
import { useDeleteRoleConditionGroupMutation } from '@/features/roles/hooks/use-delete-role-condition-group-mutation'
import { useDeleteRoleConditionMutation } from '@/features/roles/hooks/use-delete-role-condition-mutation'
import { useUpdateRoleConditionGroupMutation } from '@/features/roles/hooks/use-update-role-condition-group-mutation'
import { useUpdateRoleConditionMutation } from '@/features/roles/hooks/use-update-role-condition-mutation'
import type {
  Role,
  RoleCondition,
  RoleConditionGroup,
} from '@/features/roles/types/roles.types'
import {
  formatAssignableTypes,
  getRoleAssignmentRuleLabel,
  getRoleBlastRadiusLabel,
  getRoleDefinitionLabel,
  getRoleOperationalSummary,
  getRoleScopeModeLabel,
  getRoleScopeSummary,
  getRoleType,
  getRoleTypeLabel,
  groupPermissions,
} from '@/features/roles/utils/role-display'

type RoleDetailsPanelProps = {
  role?: Role | null
  conditions: RoleCondition[]
  conditionGroups: RoleConditionGroup[]
  isRoleLoading: boolean
  conditionsLoading: boolean
  conditionGroupsLoading: boolean
  conditionsErrorMessage?: string | null
  conditionGroupsErrorMessage?: string | null
  abacEnabled: boolean
  canUpdateRoles: boolean
  canDeleteRoles: boolean
  onEditRole: () => void
  onDeleteRole: () => void
}

type DetailSectionProps = {
  title: string
  description: string
  children: React.ReactNode
}

type MetricCardProps = {
  label: string
  value: string
}

function DetailSection({ title, description, children }: DetailSectionProps) {
  return (
    <Card className="border border-border/70 bg-card/90">
      <CardHeader className="border-b border-border/60">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-2xl border bg-background/80 px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-2xl border bg-muted/20 px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
  )
}

function getTypeIcon(role?: Role | null) {
  switch (role ? getRoleType(role) : 'root') {
    case 'global':
      return Orbit
    case 'entity':
      return TreePine
    case 'root':
    default:
      return Layers3
  }
}

export function RoleDetailsPanel({
  role,
  conditions,
  conditionGroups,
  isRoleLoading: _isRoleLoading,
  conditionsLoading,
  conditionGroupsLoading,
  conditionsErrorMessage,
  conditionGroupsErrorMessage,
  abacEnabled,
  canUpdateRoles,
  canDeleteRoles,
  onEditRole,
  onDeleteRole,
}: RoleDetailsPanelProps) {
  const TypeIcon = getTypeIcon(role)
  const groupedPermissions = useMemo(
    () => groupPermissions(role?.permissions ?? []),
    [role?.permissions]
  )
  const createConditionGroupMutation = useCreateRoleConditionGroupMutation()
  const updateConditionGroupMutation = useUpdateRoleConditionGroupMutation()
  const deleteConditionGroupMutation = useDeleteRoleConditionGroupMutation()
  const createConditionMutation = useCreateRoleConditionMutation()
  const updateConditionMutation = useUpdateRoleConditionMutation()
  const deleteConditionMutation = useDeleteRoleConditionMutation()

  const canManageRole = Boolean(role && canUpdateRoles && !role.is_system_role)
  const canDeleteRole = Boolean(role && canDeleteRoles && !role.is_system_role)
  const canManageAbac = Boolean(role && abacEnabled && canUpdateRoles && !role.is_system_role)

  if (!role) {
    return (
      <Card className="flex min-h-[40svh] items-center justify-center border border-dashed border-border/80 bg-card/80">
        <CardContent className="max-w-xl space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-accent text-accent-foreground">
            <ShieldCheck className="size-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Select a role</h2>
            <p className="text-sm text-muted-foreground">
              Inspect where a role is defined, what it affects, how it can be assigned, and any ABAC guardrails attached to it.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border/70 bg-linear-to-br from-primary/5 via-card to-accent/12">
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <TypeIcon className="size-3.5" />
                  {getRoleTypeLabel(role)}
                </Badge>
                {role.is_system_role ? <Badge variant="secondary">System role</Badge> : null}
                {role.is_auto_assigned ? <Badge variant="outline">Auto-assigned</Badge> : null}
                <Badge variant="outline">{role.permissions.length} permissions</Badge>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">{role.display_name}</h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {role.description || getRoleScopeSummary(role)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Permissions" value={String(role.permissions.length)} />
                <MetricCard
                  label="Assignable types"
                  value={role.assignable_at_types.length > 0 ? String(role.assignable_at_types.length) : 'Any'}
                />
                <MetricCard
                  label="ABAC rules"
                  value={String(conditionGroups.length + conditions.length)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onEditRole} disabled={!canManageRole}>
                <PencilLine className="size-4" />
                Edit role
              </Button>
              <Button type="button" variant="destructive" onClick={onDeleteRole} disabled={!canDeleteRole}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection
          title="Role type"
          description="Explain the ownership boundary and usage category at a glance."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Type" value={getRoleTypeLabel(role)} />
            <DetailField label="Defined at" value={getRoleDefinitionLabel(role)} />
            <DetailField label="Blast radius" value={getRoleBlastRadiusLabel(role)} />
            <DetailField
              label="System status"
              value={role.is_system_role ? 'Protected system role' : 'Custom role'}
            />
          </div>
        </DetailSection>

        <DetailSection
          title="Ownership and reach"
          description="Show where the role lives and how its permissions travel."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Root organization" value={role.root_entity_name ?? 'System-wide'} />
            <DetailField label="Defining entity" value={role.scope_entity_name ?? 'No defining entity'} />
            <DetailField label="Scope mode" value={getRoleScopeModeLabel(role.scope)} />
            <DetailField label="Summary" value={getRoleScopeSummary(role)} />
          </div>
        </DetailSection>
      </div>

      <DetailSection
        title="Assignment rules"
        description="Clarify where this role can be assigned and what admins should expect."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Assignable at" value={getRoleAssignmentRuleLabel(role)} />
          <DetailField label="Auto-assignment" value={role.is_auto_assigned ? 'Enabled' : 'Manual only'} />
          <DetailField label="Operational behavior" value={getRoleOperationalSummary(role)} />
          <DetailField
            label="Assignable entity types"
            value={formatAssignableTypes(role) ?? 'Any entity type'}
          />
        </div>
      </DetailSection>

      <DetailSection
        title="Permissions"
        description="Permissions are grouped by resource to make the blast radius readable."
      >
        {groupedPermissions.length > 0 ? (
          <div className="space-y-4">
            {groupedPermissions.map((group) => (
              <div key={group.resource} className="rounded-2xl border bg-background/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{group.label}</div>
                  <Badge variant="outline">{group.permissions.length}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.permissions.map((permissionName) => (
                    <Badge key={permissionName} variant="outline">
                      {permissionName}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
            This role does not currently grant any permissions.
          </div>
        )}
      </DetailSection>

      <DetailSection
        title="Operational behavior"
        description="Make audit and runtime consequences visible before admins change the role."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField
            label="Audit posture"
            value={role.is_system_role ? 'Protected from mutation' : 'Mutable by authorized admins'}
          />
          <DetailField
            label="Assignment mode"
            value={role.is_auto_assigned ? 'Automatic baseline access' : 'Intentional admin grant'}
          />
          <DetailField
            label="Hierarchy impact"
            value={
              role.scope === 'entity_only'
                ? 'Stops at the defining entity'
                : 'Can cascade to descendant entities'
            }
          />
        </div>
      </DetailSection>

      <AbacConditionsSection
        subjectLabel="role"
        subjectId={role.id}
        subjectIsProtected={role.is_system_role}
        abacEnabled={abacEnabled}
        canManage={canManageAbac}
        conditionGroups={conditionGroups}
        conditions={conditions}
        conditionGroupsLoading={conditionGroupsLoading}
        conditionsLoading={conditionsLoading}
        conditionGroupsErrorMessage={conditionGroupsErrorMessage}
        conditionsErrorMessage={conditionsErrorMessage}
        onCreateConditionGroup={(payload) =>
          createConditionGroupMutation.mutateAsync({
            roleId: role.id,
            ...payload,
          })
        }
        onUpdateConditionGroup={(groupId, payload) =>
          updateConditionGroupMutation.mutateAsync({
            roleId: role.id,
            groupId,
            ...payload,
          })
        }
        onDeleteConditionGroup={(groupId) =>
          deleteConditionGroupMutation.mutateAsync({
            roleId: role.id,
            groupId,
          })
        }
        onCreateCondition={(payload) =>
          createConditionMutation.mutateAsync({
            roleId: role.id,
            ...payload,
          })
        }
        onUpdateCondition={(conditionId, payload) =>
          updateConditionMutation.mutateAsync({
            roleId: role.id,
            conditionId,
            ...payload,
          })
        }
        onDeleteCondition={(conditionId) =>
          deleteConditionMutation.mutateAsync({
            roleId: role.id,
            conditionId,
          })
        }
      />
    </div>
  )
}
