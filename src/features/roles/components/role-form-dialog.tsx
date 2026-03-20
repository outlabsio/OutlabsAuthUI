import { useEffect, useEffectEvent, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { Compass, Network, Orbit, ShieldCheck, Sparkles } from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Entity } from '@/features/entities/types/entities.types'
import { RolePermissionsPicker } from '@/features/roles/components/role-permissions-picker'
import { useCreateRoleMutation } from '@/features/roles/hooks/use-create-role-mutation'
import { useUpdateRoleMutation } from '@/features/roles/hooks/use-update-role-mutation'
import {
  roleFormSchema,
  type RoleFormValues,
} from '@/features/roles/schemas/role-form.schema'
import type { Role, RoleType } from '@/features/roles/types/roles.types'
import type { RolePermissionOption } from '@/features/roles/types/role-permission-option.types'
import {
  formatRoleToken,
  getRoleType,
  getRoleTypeLabel,
} from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'

type RoleFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  role?: Role | null
  createContext?: {
    roleType?: RoleType
    rootEntityId?: string
    scopeEntityId?: string
    lockRoleType?: boolean
    lockRootEntityId?: boolean
    lockScopeEntityId?: boolean
  }
  entities: Entity[]
  permissionOptions: RolePermissionOption[]
  canCreateGlobalRoles: boolean
  onSuccess?: (role: Role) => void
}

const roleTypeOptions: Array<{
  value: RoleType
  icon: typeof Orbit
}> = [
  {
    value: 'global',
    icon: Orbit,
  },
  {
    value: 'root',
    icon: Network,
  },
  {
    value: 'entity',
    icon: Compass,
  },
]

const roleStatusOptions = [
  {
    label: 'Active',
    value: 'active',
  },
  {
    label: 'Inactive',
    value: 'inactive',
  },
] as const

function slugifyRoleName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100)
}

function resolveRootEntityId(entitiesById: Map<string, Entity>, entityId?: string) {
  if (!entityId) {
    return ''
  }

  let currentEntity = entitiesById.get(entityId) ?? null

  while (currentEntity?.parent_entity_id) {
    currentEntity = entitiesById.get(currentEntity.parent_entity_id) ?? null
  }

  return currentEntity?.id ?? ''
}

function getDefaultCreateValues(
  createContext?: RoleFormDialogProps['createContext']
): RoleFormValues {
  return {
    roleType: createContext?.roleType ?? 'root',
    name: '',
    displayName: '',
    description: '',
    rootEntityId: createContext?.rootEntityId ?? '',
    scopeEntityId: createContext?.scopeEntityId ?? '',
    status: 'active',
    scope: 'hierarchy',
    isAutoAssigned: false,
    assignableAtTypes: [],
    permissionNames: [],
  }
}

function getDefaultValues(
  mode: RoleFormDialogProps['mode'],
  role?: Role | null,
  createContext?: RoleFormDialogProps['createContext']
): RoleFormValues {
  if (mode === 'create' || !role) {
    return getDefaultCreateValues(createContext)
  }

  return {
    roleType: getRoleType(role),
    name: role.name,
    displayName: role.display_name,
    description: role.description ?? '',
    rootEntityId: role.root_entity_id ?? '',
    scopeEntityId: role.scope_entity_id ?? '',
    status: role.status === 'inactive' ? 'inactive' : 'active',
    scope: role.scope,
    isAutoAssigned: role.is_auto_assigned,
    assignableAtTypes: role.assignable_at_types,
    permissionNames: role.permissions,
  }
}

export function RoleFormDialog({
  open,
  onOpenChange,
  mode,
  role,
  createContext,
  entities,
  permissionOptions,
  canCreateGlobalRoles,
  onSuccess,
}: RoleFormDialogProps) {
  const createRoleMutation = useCreateRoleMutation()
  const updateRoleMutation = useUpdateRoleMutation()
  const [nameTouched, setNameTouched] = useState(false)
  const [showSelectedPermissionsOnly, setShowSelectedPermissionsOnly] = useState(false)
  const [visiblePermissionCount, setVisiblePermissionCount] = useState(permissionOptions.length)
  const resolver = zodResolver(roleFormSchema) as Resolver<RoleFormValues>
  const form = useForm<RoleFormValues>({
    resolver,
    defaultValues: getDefaultValues(mode, role, createContext),
  })
  const lockRoleType = Boolean(mode === 'create' && createContext?.lockRoleType)
  const lockRootEntityId = Boolean(mode === 'create' && createContext?.lockRootEntityId)
  const lockScopeEntityId = Boolean(mode === 'create' && createContext?.lockScopeEntityId)

  const entitiesById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities]
  )
  const rootEntities = useMemo(
    () =>
      entities
        .filter((entity) => entity.parent_entity_id == null)
        .sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [entities]
  )
  const entityOptions = useMemo(
    () =>
      [...entities].sort((left, right) =>
        left.display_name.localeCompare(right.display_name)
      ),
    [entities]
  )
  const entityTypeOptions = useMemo(
    () =>
      [...new Set(entities.map((entity) => entity.entity_type))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [entities]
  )

  const roleType = form.watch('roleType')
  const displayName = form.watch('displayName')
  const selectedPermissionNames = form.watch('permissionNames')
  const assignableAtTypes = form.watch('assignableAtTypes')
  const scopeEntityId = form.watch('scopeEntityId')
  const derivedRootEntityId = useMemo(
    () => resolveRootEntityId(entitiesById, scopeEntityId),
    [entitiesById, scopeEntityId]
  )
  const derivedRootEntity = derivedRootEntityId
    ? entitiesById.get(derivedRootEntityId) ?? null
    : null

  const isPending = createRoleMutation.isPending || updateRoleMutation.isPending
  const submitError =
    createRoleMutation.error ?? updateRoleMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        mode === 'create' ? 'The role could not be created.' : 'The role could not be updated.'
      )
    : null
  const resetDialogState = useEffectEvent(() => {
    form.reset(getDefaultValues(mode, role, createContext))
    setNameTouched(false)
    setShowSelectedPermissionsOnly(false)
    setVisiblePermissionCount(permissionOptions.length)
    createRoleMutation.reset()
    updateRoleMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [createContext, mode, open, role])

  useEffect(() => {
    if (mode !== 'create' || nameTouched) {
      return
    }

    form.setValue('name', slugifyRoleName(displayName), {
      shouldDirty: Boolean(displayName),
      shouldValidate: false,
    })
  }, [displayName, form, mode, nameTouched])

  useEffect(() => {
    if (selectedPermissionNames.length > 0 || !showSelectedPermissionsOnly) {
      return
    }

    setShowSelectedPermissionsOnly(false)
  }, [selectedPermissionNames.length, showSelectedPermissionsOnly])

  useEffect(() => {
    if (roleType !== 'entity') {
      form.setValue('scopeEntityId', '', { shouldDirty: true, shouldValidate: false })
      form.setValue('scope', 'hierarchy', { shouldDirty: true, shouldValidate: false })
      form.setValue('isAutoAssigned', false, {
        shouldDirty: true,
        shouldValidate: false,
      })
      form.setValue('assignableAtTypes', [], {
        shouldDirty: true,
        shouldValidate: false,
      })
    }

    if (roleType === 'global') {
      form.setValue('rootEntityId', '', { shouldDirty: true, shouldValidate: false })
    }
  }, [form, roleType])

  async function handleSubmit(values: RoleFormValues) {
    try {
      const nextRole =
        mode === 'create'
          ? await createRoleMutation.mutateAsync({
              name: values.name,
              display_name: values.displayName,
              description: values.description || undefined,
              permissions: values.permissionNames,
              is_global: values.roleType === 'global',
              status: values.status,
              root_entity_id:
                values.roleType === 'root'
                  ? values.rootEntityId || undefined
                  : undefined,
              scope_entity_id:
                values.roleType === 'entity'
                  ? values.scopeEntityId || undefined
                  : undefined,
              scope: values.roleType === 'entity' ? values.scope : 'hierarchy',
              is_auto_assigned:
                values.roleType === 'entity' ? values.isAutoAssigned : false,
              assignable_at_types:
                values.roleType === 'entity' ? values.assignableAtTypes : [],
            })
          : await updateRoleMutation.mutateAsync({
              roleId: role!.id,
              display_name: values.displayName,
              description: values.description || undefined,
              permissions: values.permissionNames,
              is_global: roleType === 'global',
              status: values.status,
              scope: roleType === 'entity' ? values.scope : undefined,
              is_auto_assigned:
                roleType === 'entity' ? values.isAutoAssigned : undefined,
              assignable_at_types:
                roleType === 'entity' ? values.assignableAtTypes : undefined,
            })

      onSuccess?.(nextRole)
      onOpenChange(false)
    } catch {
      return
    }
  }

  const dialogTitle =
    mode === 'create'
      ? 'Create role'
      : `Edit ${role?.display_name ?? 'role'}`

  const isEditingSystemRole = Boolean(role?.is_system_role)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-2xl">{dialogTitle}</DialogTitle>
                <AppInfoPopover
                  label="Explain role editor"
                  title="Role editor"
                >
                  Roles bundle permissions and decide where they apply. Use this form to define
                  ownership, reach, and assignment rules before saving.
                </AppInfoPopover>
              </div>
              {mode === 'edit' ? (
                <Badge variant="outline" className="gap-1.5">
                  <ShieldCheck className="size-3.5" />
                  {getRoleTypeLabel(roleType)}
                </Badge>
              ) : null}
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 py-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <div className="rounded-3xl border bg-linear-to-br from-primary/6 via-background to-accent/10 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="size-4 text-primary" />
                    Role type
                    <AppInfoPopover
                      label="Explain role type choices"
                      title="Role type"
                    >
                      Choose the ownership shape first. Global roles are system-wide, root roles
                      belong to one organization, and entity-defined roles live at one entity with
                      explicit local or inherited reach.
                    </AppInfoPopover>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {roleTypeOptions
                      .filter((option) => canCreateGlobalRoles || option.value !== 'global')
                      .map((option) => {
                        const Icon = option.icon
                        const checked = roleType === option.value
                        const disabled = mode === 'edit'

                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={disabled || lockRoleType}
                            onClick={() => {
                              form.setValue('roleType', option.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                              })
                            }}
                            className={cn(
                              'rounded-2xl border px-4 py-3 text-left transition-colors',
                              checked
                                ? 'border-primary bg-primary/8'
                                : 'border-border/80 bg-background/80 hover:bg-muted/40',
                              disabled || lockRoleType
                                ? 'cursor-default opacity-80'
                                : 'cursor-pointer'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="size-4 text-primary" />
                              <span className="font-medium">
                                {getRoleTypeLabel(option.value)}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl border bg-background/90 p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="role-display-name">Display name</Label>
                      <Input
                        id="role-display-name"
                        disabled={isPending || isEditingSystemRole}
                        {...form.register('displayName')}
                      />
                      <FieldError errors={[form.formState.errors.displayName]} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role-name">System name</Label>
                      <Input
                        id="role-name"
                        disabled={isPending || mode === 'edit' || isEditingSystemRole}
                        {...form.register('name', {
                          onChange: () => {
                            setNameTouched(true)
                          },
                        })}
                      />
                      <FieldError errors={[form.formState.errors.name]} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role-description">How should admins use this role?</Label>
                    <Textarea
                      id="role-description"
                      rows={4}
                      disabled={isPending || isEditingSystemRole}
                      placeholder="Describe when this role should be assigned and what operational responsibility it carries."
                      {...form.register('description')}
                    />
                    <FieldError errors={[form.formState.errors.description]} />
                  </div>

                  <div className="space-y-2">
                    <Label>Lifecycle</Label>
                    <Controller
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(nextValue) => {
                            form.setValue(
                              'status',
                              nextValue as RoleFormValues['status'],
                              {
                                shouldDirty: true,
                                shouldValidate: true,
                              }
                            )
                          }}
                          disabled={isPending || isEditingSystemRole}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select lifecycle status" />
                          </SelectTrigger>
                          <SelectContent>
                            {roleStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl border bg-background/90 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>Ownership and reach</span>
                    <AppInfoPopover
                      label="Explain ownership and reach"
                      title="Ownership and reach"
                    >
                      These fields determine where the role is anchored and whether it stays local
                      or can affect descendant entities.
                    </AppInfoPopover>
                  </div>

                  {roleType === 'root' ? (
                    <div className="space-y-2">
                      <Label>Owning organization</Label>
                      <Controller
                        control={form.control}
                        name="rootEntityId"
                        render={({ field }) => (
                          <Select
                            value={field.value || 'none'}
                            onValueChange={(nextValue) => {
                              form.setValue(
                                'rootEntityId',
                                nextValue === 'none' ? '' : String(nextValue),
                                {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                }
                              )
                            }}
                            disabled={
                              isPending ||
                              mode === 'edit' ||
                              isEditingSystemRole ||
                              lockRootEntityId
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pick a root organization" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select root organization</SelectItem>
                              {rootEntities.map((entity) => (
                                <SelectItem key={entity.id} value={entity.id}>
                                  {entity.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError errors={[form.formState.errors.rootEntityId]} />
                    </div>
                  ) : null}

                  {roleType === 'entity' ? (
                    <>
                      <div className="space-y-2">
                        <Label>Defining entity</Label>
                        <Controller
                          control={form.control}
                          name="scopeEntityId"
                          render={({ field }) => (
                          <Select
                            value={field.value || 'none'}
                            onValueChange={(nextValue) => {
                              form.setValue(
                                'scopeEntityId',
                                nextValue === 'none' ? '' : String(nextValue),
                                {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                }
                              )
                            }}
                            disabled={
                              isPending ||
                              mode === 'edit' ||
                              isEditingSystemRole ||
                              lockScopeEntityId
                            }
                          >
                              <SelectTrigger>
                                <SelectValue placeholder="Pick the entity that defines this role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select defining entity</SelectItem>
                                {entityOptions.map((entity) => (
                                  <SelectItem key={entity.id} value={entity.id}>
                                    {entity.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <FieldError errors={[form.formState.errors.scopeEntityId]} />
                      </div>

                      <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm">
                        <div className="font-medium">Derived root organization</div>
                        <div className="mt-1 text-muted-foreground">
                          {derivedRootEntity?.display_name ?? 'Pick a defining entity to resolve the root scope.'}
                        </div>
                      </div>

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
                                disabled={isPending || isEditingSystemRole}
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
                                  disabled={isPending || isEditingSystemRole}
                                />
                              )}
                            />
                          </div>
                          <FieldError errors={[form.formState.errors.isAutoAssigned]} />
                        </div>
                      </div>
                    </>
                  ) : null}

                  {(roleType === 'global' || roleType === 'root') && role ? (
                    <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      {roleType === 'global'
                        ? 'Entity-local controls do not apply to global roles.'
                        : 'The owning root stays fixed after creation.'}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-4 rounded-3xl border bg-background/90 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>Permissions</span>
                      <AppInfoPopover
                        label="Explain role permissions"
                        title="Permissions"
                      >
                        Choose the actions this role grants. Permissions are grouped by resource only
                        to make the catalog easier to scan.
                      </AppInfoPopover>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{visiblePermissionCount} visible</Badge>
                      <Badge variant="outline">
                        {selectedPermissionNames.length} selected
                      </Badge>
                      <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
                        <Switch
                          checked={showSelectedPermissionsOnly}
                          disabled={selectedPermissionNames.length === 0}
                          onCheckedChange={(checked) => {
                            setShowSelectedPermissionsOnly(Boolean(checked))
                          }}
                          aria-label="Show selected permissions only"
                        />
                        <span className="whitespace-nowrap">Selected only</span>
                      </label>
                    </div>
                  </div>

                  <RolePermissionsPicker
                    permissionOptions={permissionOptions}
                    selectedPermissionNames={selectedPermissionNames}
                    showSelectedOnly={showSelectedPermissionsOnly}
                    disabled={isPending || isEditingSystemRole}
                    resetKey={`${mode}:${role?.id ?? 'create'}:${open ? 'open' : 'closed'}`}
                    onShowSelectedOnlyChange={setShowSelectedPermissionsOnly}
                    onVisiblePermissionCountChange={setVisiblePermissionCount}
                    onChange={(nextPermissions) => {
                      form.setValue('permissionNames', nextPermissions, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                  />
                </div>

                <div className="space-y-4 rounded-3xl border bg-background/90 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>Assignment rules</span>
                    <AppInfoPopover
                      label="Explain role assignment rules"
                      title="Assignment rules"
                    >
                      Use these controls to restrict where the role can be granted in entity
                      context. Empty entity-type restrictions mean the role can be assigned anywhere
                      in scope.
                    </AppInfoPopover>
                  </div>

                  {roleType === 'entity' ? (
                    <>
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
                                disabled={isPending || isEditingSystemRole}
                                onCheckedChange={(nextChecked) => {
                                  const nextTypes = nextChecked === true
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
                    </>
                  ) : (
                    <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      {roleType === 'global'
                        ? 'Global roles are not restricted by entity type.'
                        : 'Organization roles are selected directly in the owning organization context.'}
                    </div>
                  )}
                </div>

                {submitErrorMessage ? (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                    <FieldError>{submitErrorMessage}</FieldError>
                  </div>
                ) : null}

                {isEditingSystemRole ? (
                  <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    System roles are protected by the backend and can be inspected here, but not changed.
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 mt-auto items-center justify-end gap-3 rounded-none border-t bg-background px-6 py-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="sm:min-w-28"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="sm:min-w-32"
                disabled={isPending || isEditingSystemRole}
              >
                {isPending ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
