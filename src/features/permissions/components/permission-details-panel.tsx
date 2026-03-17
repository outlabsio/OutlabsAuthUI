import { useMemo } from 'react'

import { Fingerprint, KeyRound, PencilLine, Trash2 } from 'lucide-react'

import { AbacConditionsSection } from '@/features/abac/components/abac-conditions-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PermissionCondition, PermissionConditionGroup, Permission } from '@/features/permissions/types/permissions.types'
import {
  useCreatePermissionConditionGroupMutation,
} from '@/features/permissions/hooks/use-create-permission-condition-group-mutation'
import {
  useCreatePermissionConditionMutation,
} from '@/features/permissions/hooks/use-create-permission-condition-mutation'
import {
  useDeletePermissionConditionGroupMutation,
} from '@/features/permissions/hooks/use-delete-permission-condition-group-mutation'
import {
  useDeletePermissionConditionMutation,
} from '@/features/permissions/hooks/use-delete-permission-condition-mutation'
import {
  useUpdatePermissionConditionGroupMutation,
} from '@/features/permissions/hooks/use-update-permission-condition-group-mutation'
import {
  useUpdatePermissionConditionMutation,
} from '@/features/permissions/hooks/use-update-permission-condition-mutation'
import {
  getPermissionActionLabel,
  getPermissionBehaviorSummary,
  getPermissionLifecycleLabel,
  getPermissionOperationalSummary,
  getPermissionResourceLabel,
  getPermissionScopeLabel,
} from '@/features/permissions/utils/permissions-display'
import type { Role } from '@/features/roles/types/roles.types'
import {
  getRoleScopeSummary,
  getRoleTypeLabel,
} from '@/features/roles/utils/role-display'

type PermissionDetailsPanelProps = {
  permission?: Permission | null
  linkedRoles: Role[]
  canReadRoles: boolean
  conditionGroups: PermissionConditionGroup[]
  conditions: PermissionCondition[]
  conditionGroupsLoading: boolean
  conditionsLoading: boolean
  conditionGroupsErrorMessage?: string | null
  conditionsErrorMessage?: string | null
  abacEnabled: boolean
  canUpdatePermissions: boolean
  canDeletePermissions: boolean
  onEditPermission: () => void
  onDeletePermission: () => void
}

type DetailSectionProps = {
  title: string
  description: string
  children: React.ReactNode
}

type DetailFieldProps = {
  label: string
  value: React.ReactNode
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

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="space-y-1 rounded-2xl border bg-muted/20 px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
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

export function PermissionDetailsPanel({
  permission,
  linkedRoles,
  canReadRoles,
  conditionGroups,
  conditions,
  conditionGroupsLoading,
  conditionsLoading,
  conditionGroupsErrorMessage,
  conditionsErrorMessage,
  abacEnabled,
  canUpdatePermissions,
  canDeletePermissions,
  onEditPermission,
  onDeletePermission,
}: PermissionDetailsPanelProps) {
  const createConditionGroupMutation = useCreatePermissionConditionGroupMutation()
  const updateConditionGroupMutation = useUpdatePermissionConditionGroupMutation()
  const deleteConditionGroupMutation = useDeletePermissionConditionGroupMutation()
  const createConditionMutation = useCreatePermissionConditionMutation()
  const updateConditionMutation = useUpdatePermissionConditionMutation()
  const deleteConditionMutation = useDeletePermissionConditionMutation()
  const previewTags = useMemo(() => permission?.tags ?? [], [permission?.tags])
  const canManagePermission = Boolean(permission && canUpdatePermissions && !permission.is_system)
  const canDeletePermission = Boolean(permission && canDeletePermissions && !permission.is_system)
  const canManageAbac = Boolean(permission && abacEnabled && canUpdatePermissions && !permission.is_system)

  if (!permission) {
    return (
      <Card className="flex min-h-[40svh] items-center justify-center border border-dashed border-border/80 bg-card/80">
        <CardContent className="max-w-xl space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-accent text-accent-foreground">
            <KeyRound className="size-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Select a permission</h2>
            <p className="text-sm text-muted-foreground">
              Inspect the action definition, lifecycle, linked roles, and any ABAC rules attached to it.
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
                  <Fingerprint className="size-3.5" />
                  {permission.name}
                </Badge>
                {permission.is_system ? <Badge variant="secondary">System permission</Badge> : null}
                <Badge variant={permission.is_active ? 'outline' : 'secondary'}>
                  {permission.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">{permission.display_name}</h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {permission.description || getPermissionBehaviorSummary(permission)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Tags" value={String(previewTags.length)} />
                <MetricCard label="Linked roles" value={String(linkedRoles.length)} />
                <MetricCard label="ABAC rules" value={String(conditionGroups.length + conditions.length)} />
                <MetricCard label="Status" value={permission.is_active ? 'Live' : 'Paused'} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onEditPermission} disabled={!canManagePermission}>
                <PencilLine className="size-4" />
                Edit permission
              </Button>
              <Button type="button" variant="destructive" onClick={onDeletePermission} disabled={!canDeletePermission}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection
          title="Permission identity"
          description="Show the atomic action this permission defines."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Resource" value={getPermissionResourceLabel(permission)} />
            <DetailField label="Action" value={getPermissionActionLabel(permission)} />
            <DetailField label="Scope suffix" value={getPermissionScopeLabel(permission)} />
            <DetailField label="Lifecycle" value={getPermissionLifecycleLabel(permission)} />
          </div>
        </DetailSection>

        <DetailSection
          title="Operational model"
          description="Explain what this permission means and what it does not do on its own."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Behavior" value={getPermissionBehaviorSummary(permission)} />
            <DetailField label="Operational note" value={getPermissionOperationalSummary(permission)} />
            <DetailField label="System status" value={permission.is_system ? 'Protected' : 'Mutable custom permission'} />
            <DetailField
              label="Scope owner"
              value="Roles decide where this permission applies and whether it cascades."
            />
          </div>
        </DetailSection>
      </div>

      <DetailSection
        title="Tags and auditability"
        description="Tags make custom permissions easier to discover and review."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField
            label="Tags"
            value={
              previewTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {previewTags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                'No tags'
              )
            }
          />
          <DetailField
            label="Description"
            value={permission.description || 'No description provided.'}
          />
        </div>
      </DetailSection>

      <DetailSection
        title="Roles using this permission"
        description="Roles determine where this capability takes effect across the hierarchy."
      >
        {!canReadRoles ? (
          <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
            Your current session can inspect this permission, but not the role catalog.
          </div>
        ) : linkedRoles.length > 0 ? (
          <div className="space-y-3">
            {linkedRoles.map((role) => (
              <div key={role.id} className="rounded-2xl border bg-background/80 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{role.display_name}</div>
                  <Badge variant="outline">{getRoleTypeLabel(role)}</Badge>
                  {role.is_system_role ? <Badge variant="secondary">System</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {role.description || getRoleScopeSummary(role)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
            No visible roles currently grant this permission.
          </div>
        )}
      </DetailSection>

      <AbacConditionsSection
        subjectLabel="permission"
        subjectId={permission.id}
        subjectIsProtected={permission.is_system}
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
            permissionId: permission.id,
            ...payload,
          })
        }
        onUpdateConditionGroup={(groupId, payload) =>
          updateConditionGroupMutation.mutateAsync({
            permissionId: permission.id,
            groupId,
            ...payload,
          })
        }
        onDeleteConditionGroup={(groupId) =>
          deleteConditionGroupMutation.mutateAsync({
            permissionId: permission.id,
            groupId,
          })
        }
        onCreateCondition={(payload) =>
          createConditionMutation.mutateAsync({
            permissionId: permission.id,
            ...payload,
          })
        }
        onUpdateCondition={(conditionId, payload) =>
          updateConditionMutation.mutateAsync({
            permissionId: permission.id,
            conditionId,
            ...payload,
          })
        }
        onDeleteCondition={(conditionId) =>
          deleteConditionMutation.mutateAsync({
            permissionId: permission.id,
            conditionId,
          })
        }
      />
    </div>
  )
}
