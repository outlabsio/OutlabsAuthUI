import { useEffect, useEffectEvent, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import {
  Layers3,
  Orbit,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  TreePine,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateRoleConditionGroupMutation } from '@/features/roles/hooks/use-create-role-condition-group-mutation'
import { useCreateRoleConditionMutation } from '@/features/roles/hooks/use-create-role-condition-mutation'
import { useDeleteRoleConditionGroupMutation } from '@/features/roles/hooks/use-delete-role-condition-group-mutation'
import { useDeleteRoleConditionMutation } from '@/features/roles/hooks/use-delete-role-condition-mutation'
import { useUpdateRoleConditionGroupMutation } from '@/features/roles/hooks/use-update-role-condition-group-mutation'
import { useUpdateRoleConditionMutation } from '@/features/roles/hooks/use-update-role-condition-mutation'
import {
  roleConditionFormSchema,
  type RoleConditionFormValues,
} from '@/features/roles/schemas/role-condition-form.schema'
import {
  roleConditionGroupFormSchema,
  type RoleConditionGroupFormValues,
} from '@/features/roles/schemas/role-condition-group-form.schema'
import type {
  Role,
  RoleCondition,
  RoleConditionGroup,
} from '@/features/roles/types/roles.types'
import {
  formatAssignableTypes,
  formatRoleToken,
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
import { getApiErrorMessage } from '@/lib/api/errors'

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
  action?: React.ReactNode
  children: React.ReactNode
}

type MetricCardProps = {
  label: string
  value: string
}

const conditionOperatorOptions = [
  'equals',
  'not_equals',
  'less_than',
  'less_than_or_equal',
  'greater_than',
  'greater_than_or_equal',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'matches',
  'exists',
  'not_exists',
  'is_true',
  'is_false',
  'before',
  'after',
] as const

function DetailSection({
  title,
  description,
  action,
  children,
}: DetailSectionProps) {
  return (
    <Card className="border border-border/70 bg-card/90">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {action}
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

function parseConditionValue(values: RoleConditionFormValues) {
  if (!values.value) {
    return undefined
  }

  if (values.valueType === 'integer' || values.valueType === 'float') {
    return Number(values.value)
  }

  if (values.valueType === 'boolean') {
    return values.value === 'true'
  }

  if (values.valueType === 'list') {
    return values.value
      .split(/[\n,]/g)
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return values.value
}

function formatConditionValue(condition: RoleCondition) {
  if (!condition.value) {
    return 'No value'
  }

  if (condition.value_type === 'list') {
    try {
      const parsedValue = JSON.parse(condition.value) as string[]
      return parsedValue.join(', ')
    } catch {
      return condition.value
    }
  }

  return condition.value
}

function getConditionGroupLabel(group?: RoleConditionGroup | null) {
  if (!group) {
    return 'Ungrouped'
  }

  return `${group.operator} group`
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

function RoleConditionGroupDialog({
  open,
  roleId,
  group,
  onOpenChange,
}: {
  open: boolean
  roleId: string
  group?: RoleConditionGroup | null
  onOpenChange: (open: boolean) => void
}) {
  const createMutation = useCreateRoleConditionGroupMutation()
  const updateMutation = useUpdateRoleConditionGroupMutation()
  const resolver = zodResolver(roleConditionGroupFormSchema) as Resolver<RoleConditionGroupFormValues>
  const form = useForm<RoleConditionGroupFormValues>({
    resolver,
    defaultValues: {
      operator: group?.operator ?? 'AND',
      description: group?.description ?? '',
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const submitError = createMutation.error ?? updateMutation.error
  const resetDialogState = useEffectEvent(() => {
    form.reset({
      operator: group?.operator ?? 'AND',
      description: group?.description ?? '',
    })
    createMutation.reset()
    updateMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [group, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit condition group' : 'Add condition group'}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              if (group) {
                await updateMutation.mutateAsync({
                  roleId,
                  groupId: group.id,
                  operator: values.operator,
                  description: values.description || undefined,
                })
              } else {
                await createMutation.mutateAsync({
                  roleId,
                  operator: values.operator,
                  description: values.description || undefined,
                })
              }

              onOpenChange(false)
            } catch {
              return
            }
          })}
        >
          <div className="space-y-2">
            <Label>Operator</Label>
            <Controller
              control={form.control}
              name="operator"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(nextValue) => {
                    form.setValue('operator', nextValue as RoleConditionGroupFormValues['operator'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[form.formState.errors.operator]} />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} {...form.register('description')} />
            <FieldError errors={[form.formState.errors.description]} />
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getApiErrorMessage(submitError, 'The condition group could not be saved.')}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : group ? 'Save changes' : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoleConditionDialog({
  open,
  roleId,
  condition,
  conditionGroups,
  onOpenChange,
}: {
  open: boolean
  roleId: string
  condition?: RoleCondition | null
  conditionGroups: RoleConditionGroup[]
  onOpenChange: (open: boolean) => void
}) {
  const createMutation = useCreateRoleConditionMutation()
  const updateMutation = useUpdateRoleConditionMutation()
  const resolver = zodResolver(roleConditionFormSchema) as Resolver<RoleConditionFormValues>
  const form = useForm<RoleConditionFormValues>({
    resolver,
    defaultValues: {
      attribute: condition?.attribute ?? '',
      operator: condition?.operator ?? 'equals',
      valueType: condition?.value_type ?? 'string',
      value:
        condition?.value_type === 'list' && condition.value
          ? formatConditionValue(condition)
          : condition?.value ?? '',
      description: condition?.description ?? '',
      conditionGroupId: condition?.condition_group_id ?? '',
    },
  })

  const valueType = form.watch('valueType')
  const isPending = createMutation.isPending || updateMutation.isPending
  const submitError = createMutation.error ?? updateMutation.error
  const resetDialogState = useEffectEvent(() => {
    form.reset({
      attribute: condition?.attribute ?? '',
      operator: condition?.operator ?? 'equals',
      valueType: condition?.value_type ?? 'string',
      value:
        condition?.value_type === 'list' && condition.value
          ? formatConditionValue(condition)
          : condition?.value ?? '',
      description: condition?.description ?? '',
      conditionGroupId: condition?.condition_group_id ?? '',
    })
    createMutation.reset()
    updateMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [condition, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{condition ? 'Edit condition' : 'Add condition'}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const payload = {
                attribute: values.attribute,
                operator: values.operator,
                value_type: values.valueType,
                value: parseConditionValue(values),
                description: values.description || undefined,
                condition_group_id: values.conditionGroupId || null,
              }

              if (condition) {
                await updateMutation.mutateAsync({
                  roleId,
                  conditionId: condition.id,
                  ...payload,
                })
              } else {
                await createMutation.mutateAsync({
                  roleId,
                  ...payload,
                })
              }

              onOpenChange(false)
            } catch {
              return
            }
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Attribute path</Label>
              <Input placeholder="resource.department" {...form.register('attribute')} />
              <FieldError errors={[form.formState.errors.attribute]} />
            </div>
            <div className="space-y-2">
              <Label>Operator</Label>
              <Controller
                control={form.control}
                name="operator"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(nextValue) => {
                      form.setValue('operator', nextValue as RoleConditionFormValues['operator'], {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {conditionOperatorOptions.map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {formatRoleToken(operator)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.operator]} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Value type</Label>
              <Controller
                control={form.control}
                name="valueType"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(nextValue) => {
                      form.setValue('valueType', nextValue as RoleConditionFormValues['valueType'], {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="integer">Integer</SelectItem>
                      <SelectItem value="float">Float</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                      <SelectItem value="list">List</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Condition group</Label>
              <Controller
                control={form.control}
                name="conditionGroupId"
                render={({ field }) => (
                  <Select
                    value={field.value || 'ungrouped'}
                    onValueChange={(nextValue) => {
                      form.setValue(
                        'conditionGroupId',
                        nextValue === 'ungrouped' ? '' : String(nextValue),
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        }
                      )
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ungrouped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ungrouped">Ungrouped</SelectItem>
                      {conditionGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {getConditionGroupLabel(group)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Value</Label>
            {valueType === 'list' ? (
              <Textarea
                rows={4}
                placeholder="One value per line or comma-separated"
                {...form.register('value')}
              />
            ) : valueType === 'boolean' ? (
              <Controller
                control={form.control}
                name="value"
                render={({ field }) => (
                  <Select
                    value={field.value || 'true'}
                    onValueChange={(nextValue) => {
                      form.setValue('value', String(nextValue), {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            ) : (
              <Input placeholder="Value to compare against" {...form.register('value')} />
            )}
            <FieldError errors={[form.formState.errors.value]} />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} {...form.register('description')} />
            <FieldError errors={[form.formState.errors.description]} />
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getApiErrorMessage(submitError, 'The condition could not be saved.')}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : condition ? 'Save changes' : 'Create condition'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
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
  const typeIcon = getTypeIcon(role)
  const TypeIcon = typeIcon
  const groupedPermissions = useMemo(
    () => groupPermissions(role?.permissions ?? []),
    [role?.permissions]
  )
  const groupsById = useMemo(
    () => new Map(conditionGroups.map((group) => [group.id, group])),
    [conditionGroups]
  )
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<RoleConditionGroup | null>(null)
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false)
  const [editingCondition, setEditingCondition] = useState<RoleCondition | null>(null)
  const deleteGroupMutation = useDeleteRoleConditionGroupMutation()
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
    <>
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
                    value={
                      role.assignable_at_types.length > 0
                        ? String(role.assignable_at_types.length)
                        : 'Any'
                    }
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
              <DetailField label="System status" value={role.is_system_role ? 'Protected system role' : 'Custom role'} />
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
            <DetailField
              label="Operational behavior"
              value={getRoleOperationalSummary(role)}
            />
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
                    {group.permissions.map((permission) => (
                      <Badge key={permission} variant="outline">
                        {permission}
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
            <DetailField label="Audit posture" value={role.is_system_role ? 'Protected from mutation' : 'Mutable by authorized admins'} />
            <DetailField label="Assignment mode" value={role.is_auto_assigned ? 'Automatic baseline access' : 'Intentional admin grant'} />
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

        <DetailSection
          title="ABAC conditions"
          description="Optional attribute-based rules can narrow when the role is effective."
          action={
            canManageAbac ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingGroup(null)
                    setGroupDialogOpen(true)
                  }}
                >
                  <Plus className="size-4" />
                  Add group
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditingCondition(null)
                    setConditionDialogOpen(true)
                  }}
                >
                  <Plus className="size-4" />
                  Add condition
                </Button>
              </div>
            ) : null
          }
        >
          {!abacEnabled ? (
            <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
              ABAC is disabled for this auth backend, so roles only use explicit permissions and scope.
            </div>
          ) : (
            <div className="space-y-4">
              {role.is_system_role ? (
                <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  System roles can be inspected here, but ABAC mutations are blocked by the backend.
                </div>
              ) : null}

              {conditionGroupsErrorMessage ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {conditionGroupsErrorMessage}
                </div>
              ) : null}
              {conditionsErrorMessage ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {conditionsErrorMessage}
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">Condition groups</div>
                  {conditionGroupsLoading ? <Badge variant="outline">Loading</Badge> : null}
                </div>
                {conditionGroups.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {conditionGroups.map((group) => (
                      <div key={group.id} className="rounded-2xl border bg-background/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{getConditionGroupLabel(group)}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {group.description || 'No description'}
                            </div>
                          </div>
                          {canManageAbac ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingGroup(group)
                                  setGroupDialogOpen(true)
                                }}
                              >
                                <PencilLine className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={deleteGroupMutation.isPending}
                                onClick={async () => {
                                  try {
                                    await deleteGroupMutation.mutateAsync({
                                      roleId: role.id,
                                      groupId: group.id,
                                    })
                                  } catch {
                                    return
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    No condition groups configured.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">Conditions</div>
                  {conditionsLoading ? <Badge variant="outline">Loading</Badge> : null}
                </div>
                {conditions.length > 0 ? (
                  <div className="space-y-3">
                    {conditions.map((condition) => {
                      const conditionGroup = condition.condition_group_id
                        ? groupsById.get(condition.condition_group_id) ?? null
                        : null

                      return (
                        <div key={condition.id} className="rounded-2xl border bg-background/80 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{condition.attribute}</Badge>
                                <Badge variant="outline">
                                  {formatRoleToken(condition.operator)}
                                </Badge>
                                <Badge variant="outline">
                                  {formatRoleToken(condition.value_type)}
                                </Badge>
                                <Badge variant="outline">
                                  {conditionGroup ? getConditionGroupLabel(conditionGroup) : 'Ungrouped'}
                                </Badge>
                              </div>
                              <div className="space-y-1">
                                <div className="text-sm font-medium">Value</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatConditionValue(condition)}
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {condition.description || 'No description'}
                              </div>
                            </div>
                            {canManageAbac ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingCondition(condition)
                                    setConditionDialogOpen(true)
                                  }}
                                >
                                  <PencilLine className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  disabled={deleteConditionMutation.isPending}
                                  onClick={async () => {
                                    try {
                                      await deleteConditionMutation.mutateAsync({
                                        roleId: role.id,
                                        conditionId: condition.id,
                                      })
                                    } catch {
                                      return
                                    }
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    No ABAC conditions configured.
                  </div>
                )}
              </div>
            </div>
          )}
        </DetailSection>
      </div>

      {role ? (
        <>
          <RoleConditionGroupDialog
            open={groupDialogOpen}
            roleId={role.id}
            group={editingGroup}
            onOpenChange={setGroupDialogOpen}
          />
          <RoleConditionDialog
            open={conditionDialogOpen}
            roleId={role.id}
            condition={editingCondition}
            conditionGroups={conditionGroups}
            onOpenChange={setConditionDialogOpen}
          />
        </>
      ) : null}
    </>
  )
}
