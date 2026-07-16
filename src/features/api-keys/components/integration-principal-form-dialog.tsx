import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCreateIntegrationPrincipalMutation } from '@/features/api-keys/hooks/use-create-integration-principal-mutation'
import { useUpdateIntegrationPrincipalMutation } from '@/features/api-keys/hooks/use-update-integration-principal-mutation'
import type {
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import { AssignableRolesTable } from '@/features/roles/components/assignable-roles-table'
import { getRolesForEntityQueryOptions, getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import type { Role } from '@/features/roles/types/roles.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'

const integrationPrincipalFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  roleIds: z.array(z.string()),
  status: z.enum(['active', 'inactive']),
  inheritFromTree: z.boolean(),
})

type IntegrationPrincipalFormValues = z.infer<typeof integrationPrincipalFormSchema>

type IntegrationPrincipalFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  entityLabel?: string | null
  principal: IntegrationPrincipal | null
  onOpenChange: (open: boolean) => void
  onCreated: (principal: IntegrationPrincipal) => void
  onUpdated: (principal: IntegrationPrincipal) => void
}

function buildDerivedPermissions(selectedRoles: Role[], legacyScopes: string[]) {
  return [...new Set([...selectedRoles.flatMap((role) => role.permissions), ...legacyScopes])].sort(
    (left, right) => left.localeCompare(right)
  )
}

export function IntegrationPrincipalFormDialog({
  open,
  mode,
  scopeKind,
  entityId,
  entityLabel,
  principal,
  onOpenChange,
  onCreated,
  onUpdated,
}: IntegrationPrincipalFormDialogProps) {
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const form = useForm<IntegrationPrincipalFormValues>({
    resolver: zodResolver(integrationPrincipalFormSchema),
    defaultValues: {
      name: '',
      description: '',
      roleIds: [],
      status: 'active',
      inheritFromTree: false,
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    setShowSelectedOnly(false)
    form.reset({
      name: principal?.name ?? '',
      description: principal?.description ?? '',
      roleIds: principal?.role_ids ?? [],
      status: principal?.status === 'inactive' ? 'inactive' : 'active',
      inheritFromTree: principal?.inherit_from_tree ?? false,
    })
  }, [form, open, principal])

  const platformRolesQuery = useQuery({
    ...getRolesQueryOptions({
      page: 1,
      limit: 100,
      isGlobal: true,
    }),
    enabled: open && scopeKind === 'platform_global',
  })
  const entityRolesQuery = useQuery({
    ...getRolesForEntityQueryOptions(entityId ?? '', {
      page: 1,
      limit: 100,
    }),
    enabled: open && scopeKind === 'entity' && Boolean(entityId),
  })
  const rolesQuery = scopeKind === 'platform_global' ? platformRolesQuery : entityRolesQuery

  const availableRoles = useMemo(() => rolesQuery.data?.items ?? [], [rolesQuery.data?.items])
  const roleById = useMemo(
    () => new Map(availableRoles.map((role) => [role.id, role])),
    [availableRoles]
  )
  const selectedRoleIds = form.watch('roleIds')
  const selectedRoles = useMemo(
    () =>
      selectedRoleIds
        .map((roleId) => roleById.get(roleId))
        .filter((role): role is Role => Boolean(role)),
    [roleById, selectedRoleIds]
  )
  const legacyDirectPermissions = principal?.allowed_scopes ?? []
  const derivedPermissions = useMemo(
    () => buildDerivedPermissions(selectedRoles, legacyDirectPermissions),
    [legacyDirectPermissions, selectedRoles]
  )
  const missingRoleIds = useMemo(
    () => selectedRoleIds.filter((roleId) => !roleById.has(roleId)),
    [roleById, selectedRoleIds]
  )

  const createMutation = useCreateIntegrationPrincipalMutation({ skipErrorToast: true })
  const updateMutation = useUpdateIntegrationPrincipalMutation({ skipErrorToast: true })
  const activeMutation = mode === 'create' ? createMutation : updateMutation

  const submitError = activeMutation.error
    ? getApiErrorMessage(
        activeMutation.error,
        mode === 'create'
          ? 'The service account could not be created.'
          : 'The service account could not be updated.'
      )
    : null

  const isPending = activeMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 px-4 py-3">
          <DialogTitle>
            {mode === 'create' ? 'Create service account' : 'Edit service account'}
          </DialogTitle>
        </DialogHeader>

        <form
          id="integration-principal-form"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4"
          onSubmit={form.handleSubmit(async (values) => {
            const trimmedName = values.name.trim()
            const trimmedDescription = values.description.trim() || null
            const hasRoleSelection = values.roleIds.length > 0
            const hasLegacyPermissions = legacyDirectPermissions.length > 0

            if (!hasRoleSelection && !hasLegacyPermissions) {
              form.setError('roleIds', {
                message: 'Assign at least one role to define the service-account envelope.',
              })
              return
            }

            try {
              if (mode === 'create') {
                const result = await createMutation.mutateAsync({
                  scopeKind,
                  entityId,
                  name: trimmedName,
                  description: trimmedDescription,
                  role_ids: values.roleIds,
                  allowed_scopes: [],
                  inherit_from_tree:
                    scopeKind === 'entity' ? values.inheritFromTree : false,
                })
                onCreated(result)
                return
              }

              if (!principal) {
                return
              }

              const result = await updateMutation.mutateAsync({
                scopeKind,
                entityId,
                principalId: principal.id,
                name: trimmedName,
                description: trimmedDescription,
                status: values.status,
                role_ids: values.roleIds,
                inherit_from_tree:
                  scopeKind === 'entity' ? values.inheritFromTree : false,
              })
              onUpdated(result)
            } catch {
              return
            }
          })}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="integration-principal-name">Name</Label>
                <Input
                  id="integration-principal-name"
                  placeholder="Scraping Workers"
                  disabled={isPending}
                  {...form.register('name')}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="integration-principal-description">Description</Label>
                <Textarea
                  id="integration-principal-description"
                  rows={3}
                  placeholder="What this service account does and where its keys are used."
                  disabled={isPending}
                  {...form.register('description')}
                />
                <FieldError errors={[form.formState.errors.description]} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Scope model</Label>
                <div className="min-h-8 rounded-lg border bg-background px-2.5 py-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {scopeKind === 'entity' ? 'Entity scoped' : 'Platform global'}
                    </Badge>
                    {scopeKind === 'entity' && entityLabel ? (
                      <span className="truncate text-muted-foreground">{entityLabel}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {mode === 'edit' ? (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Controller
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select lifecycle state" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.status]} />
                </div>
              ) : null}

              {scopeKind === 'entity' ? (
                <div className="space-y-2">
                  <Controller
                    control={form.control}
                    name="inheritFromTree"
                    render={({ field }) => (
                      <label className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                        <span className="space-y-0.5">
                          <span className="block font-medium">
                            Include descendant entities
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Let this service account inherit access below the selected anchor.
                          </span>
                        </span>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                          disabled={isPending}
                          aria-label="Include descendant entities"
                        />
                      </label>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.inheritFromTree]} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Assigned roles</Label>
              <Badge variant="outline">{selectedRoles.length} selected</Badge>
            </div>

            {rolesQuery.isLoading ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                Loading available roles…
              </div>
            ) : rolesQuery.isError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {getApiErrorMessage(rolesQuery.error, 'The role catalog could not be loaded.')}
              </div>
            ) : (
              <div className="h-[min(42svh,25rem)] min-h-72">
                <AssignableRolesTable
                  roles={availableRoles}
                  emptyMessage="No roles are available for this scope."
                  selectedRoleIds={selectedRoleIds}
                  showSelectedOnly={showSelectedOnly}
                  onShowSelectedOnlyChange={setShowSelectedOnly}
                  onRoleToggle={(roleId, checked) => {
                    const nextRoleIds = checked
                      ? [...new Set([...selectedRoleIds, roleId])]
                      : selectedRoleIds.filter((selectedRoleId) => selectedRoleId !== roleId)

                    form.setValue('roleIds', nextRoleIds, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }}
                  disabled={isPending}
                />
              </div>
            )}
            <FieldError errors={[form.formState.errors.roleIds]} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-3 rounded-xl border px-3 py-3">
              <div>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Role envelope
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {selectedRoles.length > 0 ? (
                    selectedRoles.map((role) => (
                      <Badge key={role.id} variant="outline">
                        {role.display_name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No roles selected yet.
                    </span>
                  )}
                </div>
              </div>

              {missingRoleIds.length > 0 ? (
                <div className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
                  {missingRoleIds.length} previously assigned role
                  {missingRoleIds.length === 1 ? '' : 's'} could not be resolved in the current
                  catalog.
                </div>
              ) : null}

              {legacyDirectPermissions.length > 0 ? (
                <div>
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Legacy direct permissions
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {legacyDirectPermissions.map((scope) => (
                      <Badge key={scope} variant="secondary">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Derived permissions
                  </div>
                </div>
                <Badge variant="outline">{derivedPermissions.length} permissions</Badge>
              </div>

              <div className="flex max-h-48 flex-wrap gap-2 overflow-auto pr-1">
                {derivedPermissions.length > 0 ? (
                  derivedPermissions.map((scope) => (
                    <Badge key={scope} variant="secondary">
                      {formatRoleToken(scope)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Select one or more roles to preview the derived permissions.
                  </span>
                )}
              </div>
            </div>
          </div>

          {submitError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          ) : null}
        </form>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t bg-muted/50 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="integration-principal-form"
            disabled={isPending || (scopeKind === 'entity' && !entityId)}
          >
            {isPending
              ? mode === 'create'
                ? 'Creating...'
                : 'Saving...'
              : mode === 'create'
                ? 'Create service account'
                : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
