import { useMemo, useState } from 'react'

import { Fingerprint, KeyRound, PencilLine, Trash2 } from 'lucide-react'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AbacConditionsSection } from '@/features/abac/components/abac-conditions-section'
import { AppSection } from '@/components/app/app-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  getPermissionStatusVariant,
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

type DetailFieldProps = {
  label: string
  value: React.ReactNode
}

type CompactMetricProps = {
  label: string
  value: React.ReactNode
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="space-y-1 rounded-2xl border bg-muted/20 px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
  )
}

function CompactMetric({ label, value }: CompactMetricProps) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1">
      <span className="text-xs font-semibold text-foreground">{value}</span>
      <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
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
  const [activeTab, setActiveTab] = useState<'definition' | 'usage' | 'policy'>('definition')
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
      <AppEmptyState
        title="Select a permission"
        description="Select a permission to inspect it."
        icon={<KeyRound className="size-7" />}
        className="min-h-[40svh] border-border/80 bg-card/80"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <Card className="shrink-0 border border-border/70 bg-card/90 ring-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Fingerprint className="size-3.5" />
                {permission.name}
              </Badge>
              {permission.is_system ? <Badge variant="secondary">System permission</Badge> : null}
              <Badge variant={getPermissionStatusVariant(permission)}>
                {permission.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onEditPermission}
                disabled={!canManagePermission}
              >
                <PencilLine className="size-4" />
                Edit permission
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onDeletePermission}
                disabled={!canDeletePermission}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="truncate text-xl font-semibold tracking-tight">
                {permission.display_name}
              </h2>
              <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
                {permission.description || getPermissionBehaviorSummary(permission)}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 xl:max-w-[22rem] xl:justify-end">
              <CompactMetric label="Tags" value={previewTags.length} />
              <CompactMetric label="Linked roles" value={linkedRoles.length} />
              <CompactMetric label="ABAC rules" value={conditionGroups.length + conditions.length} />
              <CompactMetric
                label="Status"
                value={permission.status === 'active' ? 'Live' : 'Paused'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'definition' || value === 'usage' || value === 'policy') {
            setActiveTab(value)
          }
        }}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList className="shrink-0">
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="definition" className="min-h-0 flex-1 overflow-auto pr-1 pt-1">
          <div className="space-y-4">
            <AppSection
              title="Permission identity"
              info={{
                label: 'Explain permission identity',
                title: 'Permission identity',
                content:
                  'These fields describe the capability atom itself: which resource it targets, which action it represents, and whether the name includes a scope suffix.',
              }}
            >
              <div className="space-y-3">
                <DetailField label="Resource" value={getPermissionResourceLabel(permission)} />
                <DetailField label="Action" value={getPermissionActionLabel(permission)} />
                <DetailField label="Scope suffix" value={getPermissionScopeLabel(permission)} />
                <DetailField label="Lifecycle" value={getPermissionLifecycleLabel(permission)} />
              </div>
            </AppSection>

            <AppSection
              title="Operational model"
              info={{
                label: 'Explain operational model',
                title: 'Operational model',
                content:
                  'Permissions define capability only. Roles decide where they apply, and ABAC can narrow them further at runtime.',
              }}
            >
              <div className="space-y-3">
                <DetailField label="Behavior" value={getPermissionBehaviorSummary(permission)} />
                <DetailField
                  label="Operational note"
                  value={getPermissionOperationalSummary(permission)}
                />
                <DetailField
                  label="System status"
                  value={permission.is_system ? 'Protected' : 'Mutable custom permission'}
                />
                <DetailField
                  label="Scope owner"
                  value="Roles decide where this permission applies and whether it cascades."
                />
              </div>
            </AppSection>

            <AppSection
              title="Tags and auditability"
              info={{
                label: 'Explain tags and auditability',
                title: 'Tags and auditability',
                content:
                  'Tags help operators find related permissions quickly and make custom entries easier to review later.',
              }}
            >
              <div className="space-y-3">
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
            </AppSection>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="min-h-0 flex-1 overflow-auto pr-1 pt-1">
          <div className="space-y-4">
            <AppSection
              title="Roles using this permission"
              info={{
                label: 'Explain roles using this permission',
                title: 'Roles using this permission',
                content:
                  'This list shows where the capability is currently composed into roles. Scope and inheritance still come from those roles, not from the permission itself.',
              }}
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
            </AppSection>
          </div>
        </TabsContent>

        <TabsContent value="policy" className="min-h-0 flex-1 overflow-auto pr-1 pt-1">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
