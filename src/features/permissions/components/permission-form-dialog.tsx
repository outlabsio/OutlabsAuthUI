import { useEffect, useEffectEvent, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { KeyRound, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCreatePermissionMutation } from '@/features/permissions/hooks/use-create-permission-mutation'
import { useUpdatePermissionMutation } from '@/features/permissions/hooks/use-update-permission-mutation'
import {
  permissionFormSchema,
  type PermissionFormValues,
} from '@/features/permissions/schemas/permission-form.schema'
import type { Permission } from '@/features/permissions/types/permissions.types'
import {
  getPermissionBehaviorSummary,
  getPermissionLifecycleLabel,
  getPermissionOperationalSummary,
} from '@/features/permissions/utils/permissions-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type PermissionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  permission?: Permission | null
  canCreateSystemPermissions: boolean
  onSuccess?: (permission: Permission) => void
}

function formatPermissionName(resource: string, action: string) {
  return `${resource.trim().toLowerCase()}:${action.trim().toLowerCase()}`
}

function formatDisplayNameFromName(resource: string, action: string) {
  return `${resource} ${action}`
    .trim()
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parsePermissionName(permission?: Permission | null) {
  if (!permission?.name.includes(':')) {
    return {
      resource: permission?.resource ?? '',
      action: permission?.action ?? '',
    }
  }

  const [resource, action] = permission.name.split(':', 2)
  return {
    resource,
    action,
  }
}

function getDefaultValues(permission?: Permission | null): PermissionFormValues {
  const parsedName = parsePermissionName(permission)

  return {
    resource: parsedName.resource,
    action: parsedName.action,
    displayName: permission?.display_name ?? '',
    description: permission?.description ?? '',
    tagsText: permission?.tags.join(', ') ?? '',
    isSystem: permission?.is_system ?? false,
    isActive: permission?.is_active ?? true,
  }
}

function parseTags(tagsText: string) {
  return [...new Set(tagsText.split(/[\n,]/g).map((tag) => tag.trim()).filter(Boolean))]
}

export function PermissionFormDialog({
  open,
  onOpenChange,
  mode,
  permission,
  canCreateSystemPermissions,
  onSuccess,
}: PermissionFormDialogProps) {
  const createPermissionMutation = useCreatePermissionMutation()
  const updatePermissionMutation = useUpdatePermissionMutation()
  const [displayNameTouched, setDisplayNameTouched] = useState(false)
  const resolver = zodResolver(permissionFormSchema) as Resolver<PermissionFormValues>
  const form = useForm<PermissionFormValues>({
    resolver,
    defaultValues: getDefaultValues(permission),
  })

  const resource = form.watch('resource')
  const action = form.watch('action')
  const displayName = form.watch('displayName')
  const description = form.watch('description')
  const tagsText = form.watch('tagsText')
  const isSystem = form.watch('isSystem')
  const isActive = form.watch('isActive')
  const previewName = useMemo(
    () => formatPermissionName(resource || 'resource', action || 'action'),
    [action, resource]
  )
  const previewPermission = useMemo<Permission>(
    () => ({
      id: permission?.id ?? 'preview',
      name: previewName,
      display_name:
        displayName || formatDisplayNameFromName(resource || 'resource', action || 'action'),
      description: description || null,
      resource: resource || null,
      action: action || null,
      scope: ['tree', 'all', 'own'].includes(action.split('_').at(-1) ?? '')
        ? action.split('_').at(-1) ?? null
        : null,
      is_system: isSystem,
      is_active: isActive,
      tags: parseTags(tagsText || ''),
    }),
    [
      action,
      description,
      displayName,
      form,
      isActive,
      isSystem,
      permission?.id,
      previewName,
      resource,
      tagsText,
    ]
  )

  const isPending = createPermissionMutation.isPending || updatePermissionMutation.isPending
  const submitError = createPermissionMutation.error ?? updatePermissionMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        mode === 'create'
          ? 'The permission could not be created.'
          : 'The permission could not be updated.'
      )
    : null
  const isEditingSystemPermission = Boolean(permission?.is_system)
  const resetDialogState = useEffectEvent(() => {
    form.reset(getDefaultValues(permission))
    setDisplayNameTouched(false)
    createPermissionMutation.reset()
    updatePermissionMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [mode, open, permission])

  useEffect(() => {
    if (mode !== 'create' || displayNameTouched) {
      return
    }

    form.setValue('displayName', formatDisplayNameFromName(resource, action), {
      shouldDirty: Boolean(resource || action),
      shouldValidate: false,
    })
  }, [action, displayNameTouched, form, mode, resource])

  async function handleSubmit(values: PermissionFormValues) {
    const tags = parseTags(values.tagsText)

    try {
      const nextPermission =
        mode === 'create'
          ? await createPermissionMutation.mutateAsync({
              name: formatPermissionName(values.resource, values.action),
              display_name: values.displayName,
              description: values.description || undefined,
              is_system: canCreateSystemPermissions ? values.isSystem : false,
              is_active: values.isActive,
              tags,
            })
          : await updatePermissionMutation.mutateAsync({
              permissionId: permission!.id,
              display_name: values.displayName,
              description: values.description || undefined,
              is_active: values.isActive,
              tags,
            })

      onSuccess?.(nextPermission)
      onOpenChange(false)
    } catch {
      return
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <DialogTitle className="text-2xl">
                  {mode === 'create' ? 'Create permission' : `Edit ${permission?.display_name ?? 'permission'}`}
                </DialogTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Permissions define capabilities. Roles decide where those capabilities take effect.
                </p>
              </div>
              {mode === 'edit' ? (
                <Badge variant="outline" className="gap-1.5">
                  <KeyRound className="size-3.5" />
                  {permission?.is_system ? 'System' : 'Custom'}
                </Badge>
              ) : null}
            </div>
          </DialogHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 py-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <div className="rounded-3xl border bg-linear-to-br from-primary/6 via-background to-accent/10 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="size-4 text-primary" />
                    Permission identity
                  </div>
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="permission-resource">Resource</Label>
                        <Controller
                          control={form.control}
                          name="resource"
                          render={({ field }) => (
                            <Input
                              {...field}
                              id="permission-resource"
                              disabled={isPending || mode === 'edit'}
                              placeholder="lead"
                            />
                          )}
                        />
                        <FieldError errors={[form.formState.errors.resource]} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="permission-action">Action</Label>
                        <Controller
                          control={form.control}
                          name="action"
                          render={({ field }) => (
                            <Input
                              {...field}
                              id="permission-action"
                              disabled={isPending || mode === 'edit'}
                              placeholder="create"
                            />
                          )}
                        />
                        <FieldError errors={[form.formState.errors.action]} />
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-background/80 px-4 py-3">
                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        System name
                      </div>
                      <div className="mt-1 font-mono text-sm">{previewName}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl border bg-background/90 p-5">
                  <div className="space-y-2">
                    <Label htmlFor="permission-display-name">Display name</Label>
                    <Controller
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="permission-display-name"
                          disabled={isPending || isEditingSystemPermission}
                          onFocus={() => setDisplayNameTouched(true)}
                          onChange={(event) => {
                            setDisplayNameTouched(true)
                            field.onChange(event)
                          }}
                        />
                      )}
                    />
                    <FieldError errors={[form.formState.errors.displayName]} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="permission-description">How should admins use this permission?</Label>
                    <Controller
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          id="permission-description"
                          rows={4}
                          disabled={isPending || isEditingSystemPermission}
                          placeholder="Describe the specific capability this permission unlocks."
                        />
                      )}
                    />
                    <FieldError errors={[form.formState.errors.description]} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="permission-tags">Tags</Label>
                    <Controller
                      control={form.control}
                      name="tagsText"
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          id="permission-tags"
                          rows={3}
                          disabled={isPending || isEditingSystemPermission}
                          placeholder="admin, crm, custom"
                        />
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use commas or new lines. Tags help operators find related permissions quickly.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-4 rounded-3xl border bg-background/90 p-5">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Lifecycle and safety</div>
                    <p className="text-sm text-muted-foreground">
                      Control whether the permission is protected or generally available in the catalog.
                    </p>
                  </div>

                  {canCreateSystemPermissions && mode === 'create' ? (
                    <div className="space-y-2">
                      <Label>Protected system permission</Label>
                      <div className="flex min-h-10 items-center justify-between rounded-2xl border px-4">
                        <span className="text-sm text-muted-foreground">
                          Mark this permission as system-managed and immutable after creation
                        </span>
                        <Switch
                          checked={isSystem}
                          onCheckedChange={(checked) =>
                            form.setValue('isSystem', checked, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          disabled={isPending}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label>Catalog availability</Label>
                    <div className="flex min-h-10 items-center justify-between rounded-2xl border px-4">
                        <span className="text-sm text-muted-foreground">
                          Allow roles to grant this permission right now
                        </span>
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) =>
                            form.setValue('isActive', checked, {
                              shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        disabled={isPending || isEditingSystemPermission}
                      />
                    </div>
                  </div>

                  {isEditingSystemPermission ? (
                    <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      System permissions are intentionally read-only. The backend blocks updates and deletes.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border bg-linear-to-br from-card via-background to-accent/10 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-primary" />
                    Permission preview
                  </div>
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {previewPermission.name}
                      </Badge>
                      {previewPermission.is_system ? (
                        <Badge variant="secondary">System</Badge>
                      ) : (
                        <Badge variant="outline">Custom</Badge>
                      )}
                      <Badge variant={previewPermission.is_active ? 'outline' : 'secondary'}>
                        {previewPermission.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="text-lg font-semibold">{previewPermission.display_name}</div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {previewPermission.description ||
                          getPermissionBehaviorSummary(previewPermission)}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border bg-background/70 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Lifecycle
                        </div>
                        <div className="mt-1 text-sm">
                          {getPermissionLifecycleLabel(previewPermission)}
                        </div>
                      </div>
                      <div className="rounded-2xl border bg-background/70 px-4 py-3">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Operational note
                        </div>
                        <div className="mt-1 text-sm">
                          {getPermissionOperationalSummary(previewPermission)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {submitErrorMessage ? (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {submitErrorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || isEditingSystemPermission}>
                {isPending
                  ? 'Saving…'
                  : mode === 'create'
                    ? 'Create permission'
                    : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
