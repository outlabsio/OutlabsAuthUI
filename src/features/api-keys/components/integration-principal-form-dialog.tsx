import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import {
  createIntegrationPrincipal,
  updateIntegrationPrincipal,
} from '@/features/api-keys/api/integration-principals'
import type {
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import { AssignableRolesTable } from '@/features/roles/components/assignable-roles-table'
import { getRolesForEntityQueryOptions, getRolesQueryOptions } from '@/features/roles/api/roles.query-options'
import type { Role } from '@/features/roles/types/roles.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { withMutationToast } from '@/lib/query/mutation-toast'

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
  const queryClient = useQueryClient()
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

  const mutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: async (values: IntegrationPrincipalFormValues) => {
      const trimmedName = values.name.trim()
      const trimmedDescription = values.description.trim() || null
      const hasRoleSelection = values.roleIds.length > 0
      const hasLegacyPermissions = legacyDirectPermissions.length > 0

      if (!hasRoleSelection && !hasLegacyPermissions) {
        form.setError('roleIds', {
          message: 'Assign at least one role to define the service-account envelope.',
        })
        throw new Error('role selection required')
      }

      if (mode === 'create') {
        return createIntegrationPrincipal({
          scopeKind,
          entityId,
          name: trimmedName,
          description: trimmedDescription,
          role_ids: values.roleIds,
          allowed_scopes: [],
          inherit_from_tree: scopeKind === 'entity' ? values.inheritFromTree : false,
        })
      }

      if (!principal) {
        throw new Error('integration principal missing')
      }

      return updateIntegrationPrincipal({
        scopeKind,
        entityId,
        principalId: principal.id,
        name: trimmedName,
        description: trimmedDescription,
        status: values.status,
        role_ids: values.roleIds,
        inherit_from_tree: scopeKind === 'entity' ? values.inheritFromTree : false,
      })
    },
    meta: withMutationToast({
      error:
        mode === 'create'
          ? 'The service account could not be created.'
          : 'The service account could not be updated.',
      success: mode === 'create' ? 'Service account created.' : 'Service account updated.',
      skipErrorToast: true,
    }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })

      if (mode === 'create') {
        onCreated(result)
      } else {
        onUpdated(result)
      }
    },
  })

  const submitError = mutation.error
    ? getApiErrorMessage(
        mutation.error,
        mode === 'create'
          ? 'The service account could not be created.'
          : 'The service account could not be updated.'
      )
    : null

  const isPending = mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 px-4 py-4">
          <DialogTitle>
            {mode === 'create' ? 'Create service account' : 'Edit service account'}
          </DialogTitle>
          <DialogDescription>
            Assign roles to define this machine principal. Keys created for the service account
            inherit its derived permissions by default and can optionally be narrowed later.
          </DialogDescription>
        </DialogHeader>

        <form
          id="integration-principal-form"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await mutation.mutateAsync(values)
            } catch {
              return
            }
          })}
        >
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Scope model
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {scopeKind === 'entity' ? 'Entity scoped' : 'Platform global'}
              </Badge>
              {scopeKind === 'entity' && entityLabel ? (
                <span className="text-sm text-muted-foreground">{entityLabel}</span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="integration-principal-name">Name</Label>
              <Input
                id="integration-principal-name"
                placeholder="Scraping Workers"
                disabled={isPending}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
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
                <Label className="block">Hierarchy</Label>
                <Controller
                  control={form.control}
                  name="inheritFromTree"
                  render={({ field }) => (
                    <label className="flex min-h-10 items-start gap-3 rounded-xl border px-3 py-2 text-sm">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        disabled={isPending}
                      />
                      <span>Allow descendant entity access for inherited key evaluations.</span>
                    </label>
                  )}
                />
                <FieldError errors={[form.formState.errors.inheritFromTree]} />
              </div>
            ) : null}

            <div className="space-y-3 sm:col-span-2">
              <div className="space-y-1">
                <Label>Assigned roles</Label>
                <p className="text-xs text-muted-foreground">
                  Roles define the service-account envelope. A key can inherit all derived
                  permissions or restrict itself to a subset later.
                </p>
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
              )}
              <FieldError errors={[form.formState.errors.roleIds]} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3 rounded-2xl border px-4 py-4">
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
                  <div className="mt-2 text-xs text-muted-foreground">
                    These legacy direct permissions remain in force for compatibility, but new
                    service-account access should be role-backed.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Derived permissions
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    These are the permissions owned by the service account before any key-level
                    restriction is applied.
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
