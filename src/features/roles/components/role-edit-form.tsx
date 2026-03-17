import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Entity } from '@/features/entities/types/entities.types'
import { RolePermissionsPicker } from '@/features/roles/components/role-permissions-picker'
import { useUpdateRoleMutation } from '@/features/roles/hooks/use-update-role-mutation'
import {
  roleFormSchema,
  type RoleFormValues,
} from '@/features/roles/schemas/role-form.schema'
import type { Role } from '@/features/roles/types/roles.types'
import type { RolePermissionOption } from '@/features/roles/types/role-permission-option.types'
import {
  formatRoleToken,
  getRoleType,
  getRoleTypeLabel,
} from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type RoleEditFormProps = {
  role: Role
  entities: Entity[]
  permissionOptions: RolePermissionOption[]
  onCancel: () => void
  onSuccess?: (role: Role) => void
}

function getRoleFormValues(role: Role): RoleFormValues {
  return {
    roleType: getRoleType(role),
    name: role.name,
    displayName: role.display_name,
    description: role.description ?? '',
    rootEntityId: role.root_entity_id ?? '',
    scopeEntityId: role.scope_entity_id ?? '',
    scope: role.scope,
    isAutoAssigned: role.is_auto_assigned,
    assignableAtTypes: role.assignable_at_types,
    permissionNames: role.permissions,
  }
}

export function RoleEditForm({
  role,
  entities,
  permissionOptions,
  onCancel,
  onSuccess,
}: RoleEditFormProps) {
  const updateRoleMutation = useUpdateRoleMutation()
  const [showSelectedPermissionsOnly, setShowSelectedPermissionsOnly] = useState(false)
  const [visiblePermissionCount, setVisiblePermissionCount] = useState(permissionOptions.length)
  const resolver = zodResolver(roleFormSchema) as Resolver<RoleFormValues>
  const form = useForm<RoleFormValues>({
    resolver,
    defaultValues: getRoleFormValues(role),
  })

  const selectedPermissionNames = form.watch('permissionNames')
  const assignableAtTypes = form.watch('assignableAtTypes')
  const roleType = getRoleType(role)
  const entityTypeOptions = useMemo(
    () =>
      [...new Set([...entities.map((entity) => entity.entity_type), ...role.assignable_at_types])]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [entities, role.assignable_at_types]
  )

  useEffect(() => {
    form.reset(getRoleFormValues(role))
    setShowSelectedPermissionsOnly(false)
    setVisiblePermissionCount(permissionOptions.length)
    updateRoleMutation.reset()
  }, [form, permissionOptions.length, role, updateRoleMutation])

  useEffect(() => {
    if (selectedPermissionNames.length > 0 || !showSelectedPermissionsOnly) {
      return
    }

    setShowSelectedPermissionsOnly(false)
  }, [selectedPermissionNames.length, showSelectedPermissionsOnly])

  const isPending = updateRoleMutation.isPending
  const submitErrorMessage = updateRoleMutation.error
    ? getApiErrorMessage(updateRoleMutation.error, 'The role could not be updated.')
    : null

  async function handleSubmit(values: RoleFormValues) {
    try {
      const nextRole = await updateRoleMutation.mutateAsync({
        roleId: role.id,
        display_name: values.displayName,
        description: values.description || undefined,
        permissions: values.permissionNames,
        is_global: roleType === 'global',
        scope: roleType === 'entity' ? values.scope : undefined,
        is_auto_assigned: roleType === 'entity' ? values.isAutoAssigned : undefined,
        assignable_at_types: roleType === 'entity' ? values.assignableAtTypes : undefined,
      })

      onSuccess?.(nextRole)
    } catch {
      return
    }
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
      <Card className="border border-border/70 bg-card/90">
        <CardHeader className="border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Edit role</CardTitle>
              <p className="text-sm text-muted-foreground">
                Update the permissions and operational behavior for this role.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{getRoleTypeLabel(role)}</Badge>
              {role.is_system_role ? <Badge variant="secondary">System</Badge> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-4">
            <Card className="border border-border/70 bg-background/70">
              <CardHeader className="border-b border-border/60">
                <CardTitle className="text-sm">Role identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="role-display-name">Display name</Label>
                    <Input
                      id="role-display-name"
                      disabled={isPending}
                      {...form.register('displayName')}
                    />
                    <FieldError errors={[form.formState.errors.displayName]} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role-system-name">System name</Label>
                    <Input id="role-system-name" value={role.name} disabled readOnly />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role-description">How should admins use this role?</Label>
                  <Textarea
                    id="role-description"
                    rows={4}
                    disabled={isPending}
                    placeholder="Describe when this role should be assigned and what operational responsibility it carries."
                    {...form.register('description')}
                  />
                  <FieldError errors={[form.formState.errors.description]} />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-background/70">
              <CardHeader className="border-b border-border/60">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Scope and ownership</CardTitle>
                  <AppInfoPopover
                    label="Explain immutable role fields"
                    title="Scope and ownership"
                  >
                    Role type, owning root, and defining entity are fixed after creation. Only the
                    editable operational settings remain here.
                  </AppInfoPopover>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Role type
                  </div>
                  <div className="mt-1 text-sm">{getRoleTypeLabel(role)}</div>
                </div>
                <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Owning root
                  </div>
                  <div className="mt-1 text-sm">{role.root_entity_name ?? 'System-wide'}</div>
                </div>
                <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Defining entity
                  </div>
                  <div className="mt-1 text-sm">{role.scope_entity_name ?? 'No defining entity'}</div>
                </div>
                <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Current scope
                  </div>
                  <div className="mt-1 text-sm">
                    {role.scope === 'entity_only' ? 'Entity only' : 'Hierarchy'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-background/70">
              <CardHeader className="border-b border-border/60">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Assignment rules</CardTitle>
                  <AppInfoPopover
                    label="Explain role assignment rules"
                    title="Assignment rules"
                  >
                    Use these controls to adjust scope behavior, automatic grants, and entity-type
                    restrictions for entity-defined roles.
                  </AppInfoPopover>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {roleType === 'entity' ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Scope mode</Label>
                        <Controller
                          control={form.control}
                          name="scope"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={(nextValue) => {
                                form.setValue('scope', nextValue as RoleFormValues['scope'], {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }}
                              disabled={isPending}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hierarchy">Hierarchy</SelectItem>
                                <SelectItem value="entity_only">Entity only</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Auto-assigned</Label>
                        <div className="flex min-h-10 items-center justify-between rounded-2xl border px-4">
                          <span className="text-sm text-muted-foreground">
                            Grant automatically to in-scope members
                          </span>
                          <Controller
                            control={form.control}
                            name="isAutoAssigned"
                            render={({ field }) => (
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isPending}
                              />
                            )}
                          />
                        </div>
                        <FieldError errors={[form.formState.errors.isAutoAssigned]} />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border bg-muted/20 px-4 py-3">
                        <div className="text-sm font-medium">
                          {assignableAtTypes.length > 0
                            ? `${assignableAtTypes.length} entity types selected`
                            : 'No entity type restriction'}
                        </div>
                        <Badge variant="outline">
                          {assignableAtTypes.length > 0 ? assignableAtTypes.length : 'Any'}
                        </Badge>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        {entityTypeOptions.map((entityType) => {
                          const checked = assignableAtTypes.includes(entityType)

                          return (
                            <label
                              key={entityType}
                              className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={isPending}
                                onCheckedChange={(nextChecked) => {
                                  const nextTypes = Boolean(nextChecked)
                                    ? [...assignableAtTypes, entityType]
                                    : assignableAtTypes.filter((value) => value !== entityType)

                                  form.setValue('assignableAtTypes', nextTypes, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }}
                              />
                              <span className="text-sm font-medium">
                                {formatRoleToken(entityType)}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {roleType === 'global'
                      ? 'Global roles are not restricted by entity type or local scope settings.'
                      : 'Organization-scoped roles keep their ownership and assignment posture after creation.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border/70 bg-background/70">
            <CardHeader className="border-b border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Permissions</CardTitle>
                  <AppInfoPopover
                    label="Explain role permissions"
                    title="Permissions"
                  >
                    Choose the actions this role grants. The summary controls stay in the header so
                    the catalog underneath can focus on filtering and selection.
                  </AppInfoPopover>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{visiblePermissionCount} visible</Badge>
                  <Badge variant="outline">{selectedPermissionNames.length} selected</Badge>
                  <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
                    <Switch
                      checked={showSelectedPermissionsOnly}
                      disabled={selectedPermissionNames.length === 0}
                      onCheckedChange={(checked) =>
                        setShowSelectedPermissionsOnly(Boolean(checked))
                      }
                      aria-label="Show selected permissions only"
                    />
                    <span className="whitespace-nowrap">Selected only</span>
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <RolePermissionsPicker
                permissionOptions={permissionOptions}
                selectedPermissionNames={selectedPermissionNames}
                showSelectedOnly={showSelectedPermissionsOnly}
                disabled={isPending}
                resetKey={`edit:${role.id}`}
                onShowSelectedOnlyChange={setShowSelectedPermissionsOnly}
                onVisiblePermissionCountChange={setVisiblePermissionCount}
                onChange={(nextPermissions) => {
                  form.setValue('permissionNames', nextPermissions, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }}
              />
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {submitErrorMessage ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <FieldError>{submitErrorMessage}</FieldError>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
